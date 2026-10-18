-- Dữ liệu mẫu cho Product Catalog
INSERT INTO products (name, description, price, category, stock) VALUES
(
    'MacBook Air M3',
    'Laptop Apple MacBook Air 13 inch sử dụng chip M3 mới nhất, hiệu năng vượt trội với thời lượng pin lên đến 18 giờ. RAM 8GB, SSD 256GB.',
    27990000,
    'Laptop',
    15
),
(
    'MacBook Pro M3 Pro',
    'Laptop Apple MacBook Pro 14 inch chip M3 Pro, màn hình Liquid Retina XDR, lý tưởng cho công việc sáng tạo chuyên nghiệp. RAM 18GB, SSD 512GB.',
    49990000,
    'Laptop',
    8
),
(
    'Dell XPS 13 Plus',
    'Laptop Dell XPS 13 Plus với thiết kế siêu mỏng, màn hình OLED 13.4 inch, chip Intel Core i7 thế hệ 13, RAM 16GB, SSD 512GB.',
    32990000,
    'Laptop',
    12
),
(
    'Dell Inspiron 15',
    'Laptop Dell Inspiron 15 3000 series, chip Intel Core i5, RAM 8GB, SSD 256GB + HDD 1TB, màn hình Full HD 15.6 inch, phù hợp học tập và làm việc văn phòng.',
    14990000,
    'Laptop',
    25
),
(
    'iPhone 15',
    'Điện thoại Apple iPhone 15, chip A16 Bionic, camera 48MP Dynamic Island, cổng USB-C, màn hình Super Retina XDR 6.1 inch. Dung lượng 128GB.',
    22990000,
    'Điện thoại',
    30
),
(
    'iPhone 15 Pro Max',
    'Điện thoại Apple iPhone 15 Pro Max, chip A17 Pro titanium, camera 48MP với tính năng zoom quang học 5x, màn hình ProMotion 6.7 inch. Dung lượng 256GB.',
    34990000,
    'Điện thoại',
    18
),
(
    'Samsung Galaxy S24 Ultra',
    'Điện thoại Samsung Galaxy S24 Ultra, chip Snapdragon 8 Gen 3, camera 200MP AI, bút S Pen tích hợp, màn hình Dynamic AMOLED 6.8 inch. RAM 12GB, 256GB.',
    29990000,
    'Điện thoại',
    22
),
(
    'Google Pixel 9 Pro',
    'Điện thoại Google Pixel 9 Pro, chip Google Tensor G4, camera AI hàng đầu với tính năng chỉnh sửa ảnh thông minh, màn hình OLED 6.3 inch. 128GB.',
    24990000,
    'Điện thoại',
    10
),
(
    'Sony WH-1000XM5',
    'Tai nghe chống ồn Sony WH-1000XM5, công nghệ ANC thế hệ mới nhất, âm thanh Hi-Res, thời lượng pin 30 giờ, kết nối Bluetooth 5.2.',
    8490000,
    'Phụ kiện',
    40
),
(
    'iPad Air M2',
    'Máy tính bảng Apple iPad Air 11 inch M2, chip Apple M2, màn hình Liquid Retina, hỗ trợ Apple Pencil Pro và Magic Keyboard. Wi-Fi, 128GB.',
    16990000,
    'Máy tính bảng',
    20
)
ON CONFLICT DO NOTHING;
