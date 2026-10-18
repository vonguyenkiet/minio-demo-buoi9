import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../App.jsx';

const INITIAL = { name: '', description: '', price: '', category: '', stock: '0' };

export default function CreateProduct() {
  const [form, setForm] = useState(INITIAL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await apiFetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          price: Number(form.price),
          category: form.category.trim(),
          stock: parseInt(form.stock) || 0,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess(`✅ Đã tạo sản phẩm #${data.data.id}: ${data.data.name}`);
        setForm(INITIAL);
        setTimeout(() => navigate(`/products/${data.data.id}`), 1200);
      } else {
        const errs = data.errors ? data.errors.join(' · ') : data.message;
        setError(errs || 'Lỗi không xác định');
      }
    } catch (e) {
      setError('Lỗi kết nối: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <h1>Thêm sản phẩm mới</h1>
        <p>Điền thông tin bên dưới để tạo sản phẩm</p>
      </div>

      <div className="form-section" style={{ maxWidth: 700, margin: '0 auto' }}>
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <form onSubmit={handleSubmit} id="create-product-form">
          <div className="form-grid">
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label htmlFor="field-name">Tên sản phẩm *</label>
              <input
                id="field-name"
                name="name"
                value={form.name}
                onChange={handleChange}
                required
                placeholder="Ví dụ: iPhone 16 Pro Max"
              />
            </div>
            <div className="form-group">
              <label htmlFor="field-price">Giá (VND) *</label>
              <input
                id="field-price"
                name="price"
                type="number"
                min="1"
                step="1000"
                value={form.price}
                onChange={handleChange}
                required
                placeholder="29990000"
              />
            </div>
            <div className="form-group">
              <label htmlFor="field-category">Danh mục *</label>
              <input
                id="field-category"
                name="category"
                value={form.category}
                onChange={handleChange}
                required
                placeholder="Điện thoại"
              />
            </div>
            <div className="form-group">
              <label htmlFor="field-stock">Số lượng kho</label>
              <input
                id="field-stock"
                name="stock"
                type="number"
                min="0"
                value={form.stock}
                onChange={handleChange}
                placeholder="0"
              />
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label htmlFor="field-desc">Mô tả</label>
              <textarea
                id="field-desc"
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder="Mô tả ngắn về sản phẩm..."
              />
            </div>
          </div>
          <div className="form-actions">
            <button
              id="btn-create-product"
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? 'Đang tạo...' : '➕ Tạo sản phẩm'}
            </button>
            <Link to="/" className="btn btn-outline">Hủy</Link>
          </div>
        </form>
      </div>
    </>
  );
}
