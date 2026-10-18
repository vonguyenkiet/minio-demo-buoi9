import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiFetch } from '../App.jsx';

function formatPrice(p) {
  return Number(p).toLocaleString('vi-VN') + ' ₫';
}

export default function ProductDetail() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch(`/api/products/${id}`);
        const data = await res.json();
        if (data.success) {
          setProduct(data.data);
        } else {
          setError(data.message || `Sản phẩm #${id} không tồn tại`);
        }
      } catch (e) {
        setError('Lỗi: ' + e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  if (loading) return <div className="spinner"><div className="spinner-ring"></div></div>;

  if (error) return (
    <div style={{ maxWidth: 600, margin: '3rem auto' }}>
      <div className="alert alert-error">{error}</div>
      <Link to="/" className="btn btn-outline">← Quay lại</Link>
    </div>
  );

  return (
    <div className="detail-card">
      <Link to="/" className="btn btn-outline mb-2" style={{ marginBottom: '1.5rem', display: 'inline-flex' }}>
        ← Quay lại
      </Link>
      <div className="card-category">{product.category}</div>
      <h1 style={{ fontSize: '1.6rem', marginBottom: '0.5rem' }}>{product.name}</h1>
      <div className="detail-meta">
        <span className="badge">ID: #{product.id}</span>
        <span className="badge">Kho: {product.stock ?? 0}</span>
        {product.created_at && (
          <span className="badge">{new Date(product.created_at).toLocaleDateString('vi-VN')}</span>
        )}
      </div>
      <div className="detail-price">{formatPrice(product.price)}</div>
      <div className="detail-desc">
        {product.description || <span className="text-muted">Không có mô tả</span>}
      </div>
      {product.image_url && (
        <div className="alert alert-info">
          🖼 Ảnh: {product.image_url}
        </div>
      )}
    </div>
  );
}
