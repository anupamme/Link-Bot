package miniapp

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStoreCursorResizesAndPreservesTransparency(t *testing.T) {
	im := image.NewNRGBA(image.Rect(0, 0, 100, 100))
	im.Set(50, 50, color.NRGBA{R: 200, G: 100, A: 128})
	var buf bytes.Buffer
	if err := png.Encode(&buf, im); err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	url, err := storeCursor(dir, buf.Bytes(), 32)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join(dir, strings.TrimPrefix(url, "/mini-app/uploads/")))
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := png.Decode(bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	if decoded.Bounds().Dx() != 32 || decoded.Bounds().Dy() != 32 {
		t.Fatal("incorrect resized cursor")
	}
	_, _, _, alpha := decoded.At(0, 0).RGBA()
	if alpha != 0 {
		t.Fatal("transparent pixels became opaque")
	}
	if _, err := storeCursor(dir, []byte("<svg>invalid</svg>"), 32); err == nil {
		t.Fatal("unconverted SVG accepted")
	}
	if _, err := storeCursor(dir, make([]byte, (2<<20)+1), 32); err == nil {
		t.Fatal("oversize cursor accepted")
	}
}

func TestStoreCursorValidatesCURDirectory(t *testing.T) {
	// CUR can contain a PNG payload; keep it intact so its native hotspot survives.
	im := image.NewNRGBA(image.Rect(0, 0, 32, 32))
	var pngData bytes.Buffer
	_ = png.Encode(&pngData, im)
	raw := make([]byte, 22)
	binary.LittleEndian.PutUint16(raw[2:4], 2)
	binary.LittleEndian.PutUint16(raw[4:6], 1)
	raw[6] = 32
	raw[7] = 32
	binary.LittleEndian.PutUint32(raw[14:18], uint32(pngData.Len()))
	binary.LittleEndian.PutUint32(raw[18:22], 22)
	raw = append(raw, pngData.Bytes()...)
	if url, err := storeCursor(t.TempDir(), raw, 32); err != nil || !strings.HasSuffix(url, ".cur") {
		t.Fatalf("CUR rejected: %s %v", url, err)
	}
	raw[6] = 128
	if _, err := storeCursor(t.TempDir(), raw, 32); err == nil {
		t.Fatal("oversize CUR accepted")
	}
	raw[6] = 32
	binary.LittleEndian.PutUint32(raw[18:22], uint32(len(raw)+1))
	if _, err := storeCursor(t.TempDir(), raw, 32); err == nil {
		t.Fatal("CUR outside payload accepted")
	}
}
