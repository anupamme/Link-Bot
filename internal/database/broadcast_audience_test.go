package database

import (
	"context"
	"fmt"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v4/pgxpool"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestBroadcastAudienceNormalization(t *testing.T) {
	id := uuid.New().String()
	a := BroadcastAudience{Category: " ACTIVE ", InternalSquads: []string{id, id}, Tag: " PREMIUM "}
	if err := a.Normalize(); err != nil {
		t.Fatal(err)
	}
	if a.Category != "active" || len(a.InternalSquads) != 1 || a.Tag != "PREMIUM" || a.ExternalSquads == nil {
		t.Fatalf("incorrect normalization: %+v", a)
	}
	for _, a := range []BroadcastAudience{{Category: "unknown"}, {InternalSquads: []string{"not-a-uuid"}}, {Language: "invalid"}} {
		if err := a.Normalize(); err == nil {
			t.Fatal("invalid audience accepted")
		}
	}
}

// Uses only a disposable schema in the explicitly configured test database.
func TestBroadcastAudiencePersistenceAndDraftGuards(t *testing.T) {
	dsn := os.Getenv("BROADCAST_AUDIENCE_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set BROADCAST_AUDIENCE_TEST_DATABASE_URL to an isolated database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	cfg.MaxConns = 1
	cfg.ConnConfig.PreferSimpleProtocol = true
	pool, err := pgxpool.ConnectConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	schema := fmt.Sprintf("audience_test_%d", time.Now().UnixNano())
	if _, err = pool.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal(err)
	}
	defer pool.Exec(context.Background(), "DROP SCHEMA "+schema+" CASCADE")
	_, err = pool.Exec(ctx, "SET search_path TO "+schema)
	if err != nil {
		t.Fatal(err)
	}
	_, err = pool.Exec(ctx, `CREATE TABLE customer(id BIGINT PRIMARY KEY,telegram_id BIGINT,telegram_id_is_synthetic BOOLEAN,trial_used BOOLEAN,language TEXT,expire_at TIMESTAMPTZ,is_blocked BOOLEAN);
	CREATE TABLE customer_email_auth(customer_id BIGINT PRIMARY KEY,email TEXT);
	CREATE TABLE customer_subscription(customer_id BIGINT,panel_user_id BIGINT,panel_user_uuid UUID,expire_at TIMESTAMPTZ,position INTEGER);
	CREATE TABLE purchase(customer_id BIGINT,status TEXT,purchase_kind TEXT,amount BIGINT,is_free_plan BOOLEAN);
	CREATE TABLE email_auth_challenge(mode TEXT CONSTRAINT email_auth_challenge_mode_check CHECK(mode IN ('login','register')));
	INSERT INTO customer VALUES (1,101,false,true,'ru',NULL,false),(2,102,false,false,'en',NULL,true),(3,103,true,false,'en',NULL,false);
	INSERT INTO customer_email_auth VALUES(1,'one@example.com'),(3,'web@example.com');
	INSERT INTO customer_subscription VALUES(1,10,NULL,NOW()+INTERVAL '1 day',0),(1,11,NULL,NOW()+INTERVAL '2 days',1);
	INSERT INTO purchase VALUES(1,'paid','subscription',100,false),(3,'paid','devices',100,false);`)
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"000017_broadcast_campaign.up.sql", "000030_broadcast_html.up.sql", "000048_email_link_and_broadcast.up.sql", "000055_broadcast_audience.up.sql", "000056_broadcast_paid_lookup.up.sql"} {
		raw, err := os.ReadFile(filepath.Join("..", "..", "db", "migrations", name))
		if err != nil {
			t.Fatal(err)
		}
		if _, err = pool.Exec(ctx, string(raw)); err != nil {
			t.Fatalf("%s: %v", name, err)
		}
	}
	c := NewCustomerRepository(pool)
	b := NewBroadcastRepository(pool)
	for _, tc := range []struct {
		category, language, channel string
		exclude                     int64
		want                        int
	}{
		{"all", "", "telegram", 0, 1},
		{"all", "", "telegram", 101, 0},
		{"all", "", "email", 0, 2},
		{"all", "en", "email", 0, 1},
		{"paid", "", "email", 0, 1},
		{"trial_used", "", "email", 0, 1},
		{"trial_used", "en", "email", 0, 0},
	} {
		a := BroadcastAudience{Category: tc.category, Language: tc.language}
		count, err := c.CountLocalBroadcastAudience(ctx, a, tc.channel, tc.exclude)
		if err != nil || count != tc.want {
			t.Fatalf("local count %+v: %d, %v", tc, count, err)
		}
		customers, err := c.LocalBroadcastCustomers(ctx, a)
		if err != nil {
			t.Fatal(err)
		}
		expected := 0
		for _, customer := range customers {
			if tc.channel == "email" && customer.Email != "" || tc.channel == "telegram" && customer.TelegramID > 0 && !customer.Synthetic && customer.TelegramID != tc.exclude {
				expected++
			}
		}
		if count != expected {
			t.Fatalf("count differs from send recipients: %+v", tc)
		}
	}
	if _, err := c.CountLocalBroadcastAudience(ctx, BroadcastAudience{Category: "active"}, "telegram", 0); err == nil {
		t.Fatal("panel audience counted locally")
	}
	customers, err := c.BroadcastCustomers(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(customers) != 2 || len(customers[0].Subscriptions) != 2 || !customers[0].Paid || customers[1].Paid || customers[0].Email != "one@example.com" {
		t.Fatalf("incorrect eligible accounts: %+v", customers)
	}
	a := BroadcastAudience{Category: "active", Tag: "PREMIUM"}
	_ = a.Normalize()
	draft, err := b.SaveAudience(ctx, a, 101)
	if err != nil {
		t.Fatal(err)
	}
	if draft.Audience.Category != "active" || draft.Audience.Tag != "PREMIUM" {
		t.Fatal("Telegram audience lost")
	}
	if _, err = b.StartCapture(ctx, 101); err != nil {
		t.Fatal(err)
	}
	draft, err = b.SaveSource(ctx, 101, 42, "text", "Test", "Test", 101)
	if err != nil {
		t.Fatal(err)
	}
	stale := draft.UpdatedAt
	draft, err = b.SaveAudience(ctx, BroadcastAudience{Category: "none"}, 101)
	if err != nil {
		t.Fatal(err)
	}
	if started, err := b.BeginSend(ctx, 1, 101, stale); err == nil && started != nil {
		t.Fatal("Telegram accepted a stale draft")
	}
	if _, err = b.BeginSend(ctx, 1, 101, draft.UpdatedAt); err != nil {
		t.Fatal(err)
	}
	if _, err = b.SaveAudience(ctx, a, 101); err == nil {
		t.Fatal("changed audience during Telegram send")
	}
	email, err := c.SaveEmailBroadcastDraft(ctx, "Subject", "Body", 101)
	if err != nil {
		t.Fatal(err)
	}
	stale = email.UpdatedAt
	email, err = c.SaveEmailAudience(ctx, a, 101)
	if err != nil {
		t.Fatal(err)
	}
	if email.Audience.Tag != "PREMIUM" {
		t.Fatal("email audience lost")
	}
	if _, err = c.BeginEmailBroadcast(ctx, 1, 101, stale); err == nil {
		t.Fatal("email accepted a stale draft")
	}
	if _, err = c.BeginEmailBroadcast(ctx, 1, 101, email.UpdatedAt); err != nil {
		t.Fatal(err)
	}
	if _, err = c.SaveEmailAudience(ctx, a, 101); err == nil {
		t.Fatal("changed audience during email send")
	}
}
