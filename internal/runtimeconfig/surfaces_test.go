package runtimeconfig

import "testing"

func TestSurfaceSettingsMigrationAndIndependentPalette(t *testing.T) {
	s := DefaultSettings()
	s.Version = 27
	if err := NormalizeAndValidate(&s); err != nil {
		t.Fatal(err)
	}
	for _, surface := range []string{"landing", "cabinet", "admin"} {
		if c := s.Appearance.Cursors[surface]; c.Mode != "system" || c.Size != 32 {
			t.Fatalf("%s: %+v", surface, c)
		}
	}
	before := s.Appearance.Colors["accent"]
	s.Appearance.Landing.Colors["accent"] = "#123456"
	s.Appearance.Landing.Text["heroTitle"] = "Мой сервис"
	s.Appearance.Landing.PerPage = true
	s.Appearance.Landing.Pages["servers"] = LandingBackground{Mode: "grid"}
	if err := NormalizeAndValidate(&s); err != nil {
		t.Fatal(err)
	}
	if s.Appearance.Colors["accent"] != before || s.Appearance.Landing.Colors["accent"] != "#123456" {
		t.Fatal("landing palette changes cabinet")
	}
	if s.Appearance.Landing.Text["heroTitle"] != "Мой сервис" || s.Appearance.Landing.Pages["servers"].Mode != "grid" {
		t.Fatal("landing overrides lost")
	}
	if s.Appearance.Landing.Pages["plans"].Mode != "inherit" {
		t.Fatal("default page background must inherit")
	}
}

func TestSurfaceSettingsRejectInvalidAssets(t *testing.T) {
	for _, tc := range []struct {
		name   string
		change func(*AppearanceSettings)
	}{
		{"cursor protocol", func(a *AppearanceSettings) {
			a.Cursors["admin"] = CursorSettings{Mode: "custom", URL: "javascript:alert(1)", Size: 32}
		}},
		{"missing cursor", func(a *AppearanceSettings) { a.Cursors["landing"] = CursorSettings{Mode: "custom", Size: 32} }},
		{"cursor hotspot", func(a *AppearanceSettings) {
			a.Cursors["cabinet"] = CursorSettings{Mode: "paw", Size: 32, HotspotX: 32}
		}},
		{"cursor too large", func(a *AppearanceSettings) { a.Cursors["cabinet"] = CursorSettings{Mode: "paw", Size: 128} }},
		{"invalid color", func(a *AppearanceSettings) { a.Landing.Colors["accent"] = "red;position:fixed" }},
		{"missing background", func(a *AppearanceSettings) {
			a.Landing.Background = LandingBackground{Mode: "custom", BackgroundID: "missing"}
		}},
		{"unsafe icon", func(a *AppearanceSettings) { a.Landing.Icons["plans"] = "data:text/html,<script>" }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := DefaultSettings()
			if err := NormalizeAndValidate(&s); err != nil {
				t.Fatal(err)
			}
			tc.change(&s.Appearance)
			if err := NormalizeAndValidate(&s); err == nil {
				t.Fatal("invalid surface configuration accepted")
			}
		})
	}
}
