# 🏫 Lớp Học Vui

Game đố vui cả lớp: màn hình giáo viên chiếu lên bảng (lớp học có bàn ghế, nhân vật), học sinh vào lớp bằng điện thoại (quét QR hoặc nhập PIN).

- Tối đa **40 học sinh**, mỗi bạn tự chọn nhân vật (da, tóc, kiểu tóc, áo, phụ kiện).
- Vào lớp trước ngồi trước. Sau **mỗi câu**, cả lớp đổi chỗ theo điểm: **hạng 1 ngồi gần bàn giáo viên nhất**, rồi lần lượt trái → phải, trên → dưới.
- Câu hỏi được **đọc to** (giọng tiếng Anh của trình duyệt), có **20 giây** để trả lời.
- Điểm: bạn đúng **nhanh nhất** = **sĩ số lớp** (lớp 25 bạn → 25 điểm), thứ nhì 24, thứ ba 23… Sai / không trả lời = 0.
- **Lồng tiếng bình luận** tiếng Việt (ai nhanh nhất, ai dẫn đầu, ai bị gọi lên bảng, lễ vinh danh) + phụ đề. Giọng hay nhất khi mở bằng Microsoft Edge.
- Sai (hoặc bỏ trống) **2 câu liên tiếp** → lên bảng đứng, vẫn trả lời tiếp; đúng là về chỗ.
- Sau mỗi câu có **bảng tốc độ**: ai trả lời lúc mấy giây, đúng/sai, được bao nhiêu điểm.
- 6 dạng bài: trắc nghiệm, đúng/sai, điền từ, sắp xếp câu, tìm lỗi sai, nghe & chép.
- Mỗi session **15–20 câu**, kết thúc bằng lễ **vinh danh top 3** (bục podium, nhạc, pháo giấy) + tải bảng điểm CSV.

## Chạy thử
Mở `host.html?local=1` → "Mở lớp học" → bấm **+5 học sinh ảo** vài lần để xem lớp đông. Mở thêm tab `play.html?local=1` trên cùng trình duyệt để đóng vai học sinh.

## Đưa lên Vercel
1. Tạo repo mới trên GitHub, đẩy toàn bộ thư mục này lên (không cần build).
2. Vào vercel.com → **Add New → Project** → chọn repo → **Deploy** (Framework: *Other*, để trống Build Command).
3. Giáo viên mở `https://<tên-dự-án>.vercel.app/host.html`, học sinh quét QR trên bảng.

## Cách viết bộ câu hỏi
```
She ___ to school every day.
A. go
*B. goes
C. going
D. gone
```
Mỗi câu cách nhau 1 dòng trống, dấu `*` đánh dấu đáp án đúng (hoặc thêm dòng `Answer: B`). 2–4 lựa chọn.

## Kỹ thuật
- Web tĩnh thuần HTML/CSS/JS, không cần server riêng, không cần tài khoản.
- Kết nối thời gian thực qua **MQTT WebSocket** với máy chủ công cộng (EMQX, dự phòng HiveMQ / Mosquitto). Tab giáo viên phải luôn mở.
- Dữ liệu (tên học sinh, câu trả lời) đi qua máy chủ công cộng nên đừng nhập thông tin nhạy cảm. Muốn dùng máy chủ riêng thì thêm `?broker=wss://...` vào link.
- Phím tắt màn hình giáo viên: `Space` / `→` = bắt đầu / câu tiếp. Bấm vào một học sinh để mời ra khỏi lớp.
