# 🏫 Lớp Học Vui

Game đố vui cả lớp: màn hình giáo viên chiếu lên bảng (lớp học có bàn ghế, nhân vật), học sinh vào lớp bằng điện thoại (quét QR hoặc nhập PIN).

- Tối đa **40 học sinh**, mỗi bạn tự chọn nhân vật (da, tóc, kiểu tóc, áo, phụ kiện).
- Vào lớp trước ngồi bàn đầu trước. Sau **mỗi câu**, cả lớp đứng dậy đổi chỗ theo điểm: **điểm cao ngồi bàn đầu, ở giữa**.
- Câu hỏi được **đọc to** (giọng tiếng Anh của trình duyệt), có **20 giây** để trả lời.
- Điểm: trả lời đúng ngay lập tức = **sĩ số lớp**, giảm dần còn một nửa ở giây cuối. Sai / không trả lời = 0.
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
- Kết nối thời gian thực bằng **PeerJS (WebRTC)**: máy giáo viên là "phòng", điện thoại kết nối thẳng vào. Tab giáo viên phải luôn mở.
- Nếu wifi trường chặn kết nối, cho học sinh dùng 4G, hoặc chuyển sang Firebase/Supabase Realtime (chỉ cần thay `js/net.js`).
- Phím tắt màn hình giáo viên: `Space` / `→` = bắt đầu / câu tiếp. Bấm vào một học sinh để mời ra khỏi lớp.
