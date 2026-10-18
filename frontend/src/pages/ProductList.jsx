import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../App.jsx';

function formatPrice(p) {
  return Number(p).toLocaleString('vi-VN') + ' ₫';
}

export default function ProductList() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/products');
      const data = await res.json();
      if (data.success) {
        setProducts(data.data);
      } else {
        setError(data.message || 'Lỗi tải sản phẩm');
      }
    } catch (e) {
      setError('Không kết nối được server: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <>
      <div className="page-header">
        <h1>Danh sách sản phẩm</h1>
        <p>{loading ? 'Đang tải...' : `${products.length} sản phẩm`}</p>
      </div>

      {error && (
        <div className="alert alert-error mb-2">
          ❌ {error}
          <button className="btn btn-outline mt-1" onClick={load} style={{ marginLeft: '1rem', padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}>
            Thử lại
          </button>
        </div>
      )}

      {loading ? (
        <div className="spinner"><div className="spinner-ring"></div></div>
      ) : products.length === 0 ? (
        <div className="empty-state">
          <h3>Chưa có sản phẩm</h3>
          <p>Thêm sản phẩm đầu tiên nào!</p>
        </div>
      ) : (
        <div className="grid">
          {products.map(p => (
            <div key={p.id} className="card" onClick={() => navigate(`/products/${p.id}`)}>
              <div className="card-category">{p.category}</div>
              <div className="card-name">{p.name}</div>
              <div className="card-desc">{p.description || 'Không có mô tả'}</div>
              <div className="card-footer">
                <span className="price">{formatPrice(p.price)}</span>
                <span className="stock">Kho: {p.stock ?? 0}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
