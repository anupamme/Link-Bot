package runtimeconfig

import (
	"fmt"
	"strings"
)

type CursorSettings struct {
	Mode       string `json:"mode"`
	URL        string `json:"url"`
	PointerURL string `json:"pointerUrl"`
	Size       int    `json:"size"`
	HotspotX   int    `json:"hotspotX"`
	HotspotY   int    `json:"hotspotY"`
}

type LandingBackground struct {
	Mode         string `json:"mode"`
	BackgroundID string `json:"backgroundId"`
}

type LandingSettings struct {
	Colors       map[string]string            `json:"colors"`
	Background   LandingBackground            `json:"background"`
	PerPage      bool                         `json:"perPage"`
	Pages        map[string]LandingBackground `json:"pages"`
	Text         map[string]string            `json:"text"`
	Icons        map[string]string            `json:"icons"`
	ButtonRadius int                          `json:"buttonRadius"`
}

func DefaultLandingSettings(colors map[string]string) LandingSettings {
	palette := map[string]string{}
	for _, key := range []string{"background", "surface", "surfaceStrong", "text", "muted", "border", "accent", "success", "danger"} {
		palette[key] = colors[key]
	}
	return LandingSettings{Colors: palette, Background: LandingBackground{Mode: "solid"}, ButtonRadius: 8,
		Pages: map[string]LandingBackground{}, Icons: map[string]string{}, Text: map[string]string{
			"heroTitle": "Интернет без ограничений", "heroAccent": "в один клик",
			"heroLead":    "Стабильное соединение для работы, общения и всего, что важно. Выберите тариф и подключайтесь в личном кабинете.",
			"trialButton": "Попробовать бесплатно", "cabinetButton": "Кабинет", "serversButton": "Сервера",
			"serversTitle": "Наши сервера", "serversLead": "Актуальное состояние каждого узла.",
			"plansButton": "Тарифы", "plansTitle": "Выберите свой срок", "plansLead": "Все доступные тарифы, от коротких к длительным.",
			"supportButton": "Поддержка", "supportTitle": "Всегда на связи", "supportLead": "Поможем с подключением и ответим на вопросы.",
			"buyButton": "Подключить", "contactButton": "Написать", "title": "Интернет без ограничений",
		}}
}

func validateSurfaces(a *AppearanceSettings) error {
	if a.Cursors == nil {
		a.Cursors = map[string]CursorSettings{}
	}
	for _, surface := range []string{"landing", "cabinet", "admin"} {
		c := a.Cursors[surface]
		if c.Mode == "" {
			c.Mode = "system"
		}
		c.URL = strings.TrimSpace(c.URL)
		c.PointerURL = strings.TrimSpace(c.PointerURL)
		if !contains([]string{"system", "paw", "arrow", "ring", "crosshair", "custom"}, c.Mode) {
			return fmt.Errorf("invalid cursor for %s", surface)
		}
		if c.Size == 0 {
			c.Size = 32
		}
		if c.Size < 16 || c.Size > 64 || c.HotspotX < 0 || c.HotspotY < 0 || c.HotspotX >= c.Size || c.HotspotY >= c.Size {
			return fmt.Errorf("cursor size must be 16–64 px; hotspot must be inside it")
		}
		for _, asset := range []string{c.URL, c.PointerURL} {
			if asset != "" && !isSafeAssetURL(asset) {
				return fmt.Errorf("invalid cursor image URL")
			}
		}
		if c.Mode == "custom" && c.URL == "" {
			return fmt.Errorf("upload or enter a custom cursor image")
		}
		a.Cursors[surface] = c
	}
	for key := range a.Cursors {
		if !contains([]string{"landing", "cabinet", "admin"}, key) {
			delete(a.Cursors, key)
		}
	}
	defaults := DefaultLandingSettings(a.Colors)
	l := &a.Landing
	if l.Colors == nil {
		l.Colors = map[string]string{}
		l.ButtonRadius = 8
	}
	for key, color := range defaults.Colors {
		if l.Colors[key] == "" {
			l.Colors[key] = color
		}
		if l.Colors[key] != "" && !hexColorPattern.MatchString(l.Colors[key]) {
			return fmt.Errorf("invalid landing color %s", key)
		}
	}
	for key := range l.Colors {
		if _, ok := defaults.Colors[key]; !ok {
			delete(l.Colors, key)
		}
	}
	if l.ButtonRadius < 0 || l.ButtonRadius > 24 {
		return fmt.Errorf("landing button radius must be 0–24")
	}
	if l.Text == nil {
		l.Text = map[string]string{}
	}
	for key, fallback := range defaults.Text {
		l.Text[key] = normalizedRequiredText(l.Text[key], fallback, 1000)
	}
	for key := range l.Text {
		if _, ok := defaults.Text[key]; !ok {
			delete(l.Text, key)
		}
	}
	if l.Icons == nil {
		l.Icons = map[string]string{}
	}
	for key, asset := range l.Icons {
		if !contains([]string{"servers", "plans", "support", "cabinet"}, key) || asset != "" && !isSafeAssetURL(strings.TrimSpace(asset)) {
			return fmt.Errorf("invalid landing icon")
		}
		l.Icons[key] = strings.TrimSpace(asset)
	}
	if l.Pages == nil {
		l.Pages = map[string]LandingBackground{}
	}
	validateBG := func(bg *LandingBackground, inherit bool) error {
		if bg.Mode == "" {
			if inherit {
				bg.Mode = "inherit"
			} else {
				bg.Mode = "solid"
			}
		}
		if !contains([]string{"inherit", "solid", "animated", "grid", "grid2", "blocks", "morphic", "twinkle", "backtyan", "custom"}, bg.Mode) || (!inherit && bg.Mode == "inherit") {
			return fmt.Errorf("invalid landing background")
		}
		if bg.Mode == "custom" {
			found := false
			for _, item := range a.CustomBackgrounds {
				if item.ID == bg.BackgroundID {
					found = true
				}
			}
			if !found {
				return fmt.Errorf("select an existing landing background")
			}
		}
		return nil
	}
	if err := validateBG(&l.Background, false); err != nil {
		return err
	}
	for _, key := range []string{"home", "servers", "plans", "support"} {
		bg := l.Pages[key]
		if err := validateBG(&bg, true); err != nil {
			return err
		}
		l.Pages[key] = bg
	}
	for key := range l.Pages {
		if !contains([]string{"home", "servers", "plans", "support"}, key) {
			delete(l.Pages, key)
		}
	}
	return nil
}
