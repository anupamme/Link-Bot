package miniapp

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"image"
	"image/color"
	"image/png"
	"io"
	"link-bot/internal/database"
	"net/http"
	"os"
	"path/filepath"
)

func storeCursor(dir string, data []byte, size int) (string, error) {
	if len(data) == 0 || len(data) > 2<<20 {
		return "", errors.New("Курсор должен быть не больше 2 МБ")
	}
	if size < 16 || size > 64 {
		size = 32
	}
	ext := "png"
	if len(data) >= 6 && binary.LittleEndian.Uint16(data[:2]) == 0 && binary.LittleEndian.Uint16(data[2:4]) == 2 {
		count := int(binary.LittleEndian.Uint16(data[4:6]))
		if count < 1 || count > 16 || len(data) < 6+count*16 {
			return "", errors.New("Некорректный CUR")
		}
		for i := 0; i < count; i++ {
			d := data[6+i*16 : 6+(i+1)*16]
			length := uint64(binary.LittleEndian.Uint32(d[8:12]))
			offset := uint64(binary.LittleEndian.Uint32(d[12:16]))
			if d[0] == 0 || d[1] == 0 || d[0] > 64 || d[1] > 64 || offset < uint64(6+count*16) || length == 0 || offset+length > uint64(len(data)) {
				return "", errors.New("CUR: максимум 64×64 пикселя")
			}
		}
		ext = "cur"
	} else {
		config, _, err := image.DecodeConfig(bytes.NewReader(data))
		if err != nil || config.Width < 1 || config.Height < 1 || config.Width > 4096 || config.Height > 4096 || config.Width*config.Height > 4_194_304 {
			return "", errors.New("Используйте PNG, JPG, GIF, WebP или CUR")
		}
		source, _, err := image.Decode(bytes.NewReader(data))
		if err != nil {
			return "", errors.New("Не удалось прочитать изображение курсора")
		}
		output := image.NewNRGBA(image.Rect(0, 0, size, size))
		bounds := source.Bounds()
		for y := 0; y < size; y++ {
			for x := 0; x < size; x++ {
				fx := float64(x) * float64(bounds.Dx()-1) / float64(size-1)
				fy := float64(y) * float64(bounds.Dy()-1) / float64(size-1)
				x0, y0 := int(fx), int(fy)
				x1, y1 := min(x0+1, bounds.Dx()-1), min(y0+1, bounds.Dy()-1)
				dx, dy := fx-float64(x0), fy-float64(y0)
				weights := []float64{(1 - dx) * (1 - dy), dx * (1 - dy), (1 - dx) * dy, dx * dy}
				points := [][2]int{{x0, y0}, {x1, y0}, {x0, y1}, {x1, y1}}
				var channels [4]float64
				for i, p := range points {
					r, g, b, a := source.At(bounds.Min.X+p[0], bounds.Min.Y+p[1]).RGBA()
					for j, v := range []uint32{r, g, b, a} {
						channels[j] += float64(v) * weights[i]
					}
				}
				output.Set(x, y, color.RGBA64{R: uint16(channels[0]), G: uint16(channels[1]), B: uint16(channels[2]), A: uint16(channels[3])})
			}
		}
		var buffer bytes.Buffer
		if err = png.Encode(&buffer, output); err != nil {
			return "", err
		}
		data = buffer.Bytes()
	}
	hash := sha256.Sum256(data)
	name := "cursor-" + hex.EncodeToString(hash[:8]) + "." + ext
	if err := os.MkdirAll(dir, 0750); err != nil {
		return "", err
	}
	if err := os.WriteFile(filepath.Join(dir, name), data, 0640); err != nil {
		return "", err
	}
	return "/mini-app/uploads/" + name, nil
}

func (h *Handler) handleAdminCursorUpload(w http.ResponseWriter, r *http.Request, sess *session, _ *database.Customer) {
	if !sess.canAdmin("appearance") {
		h.writeError(w, 403, "forbidden", "Недостаточно прав")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, (2<<20)+(256<<10))
	if err := r.ParseMultipartForm(2 << 20); err != nil {
		h.writeError(w, 400, "cursor_invalid", "Выберите файл до 2 МБ")
		return
	}
	defer r.MultipartForm.RemoveAll()
	file, _, err := r.FormFile("cursor")
	if err != nil {
		h.writeError(w, 400, "cursor_missing", "Выберите курсор")
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, (2<<20)+1))
	if err != nil {
		h.writeError(w, 400, "cursor_invalid", "Не удалось прочитать файл")
		return
	}
	url, err := storeCursor(h.logoUploadDir, data, 64)
	if err != nil {
		h.writeError(w, 400, "cursor_invalid", err.Error())
		return
	}
	h.writeJSON(w, 200, map[string]any{"ok": true, "data": map[string]string{"url": url}})
}
