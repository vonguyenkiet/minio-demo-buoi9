import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import ProductList from './pages/ProductList.jsx';
import ProductDetail from './pages/ProductDetail.jsx';
import CreateProduct from './pages/CreateProduct.jsx';
import StorageDemo from './pages/StorageDemo.jsx';

// ── Instance badge global state ──
let _instance = '—';
let _setters = [];
export function setGlobalInstance(inst) {
  _instance = inst;
  _setters.forEach(fn => fn(inst));
}
export function useInstanceBadge() {
  const [inst, setInst] = useState(_instance);
  useEffect(() => {
    _setters.push(setInst);
    return () => { _setters = _setters.filter(f => f !== setInst); };
  }, []);
  return inst;
}

// ── Custom fetch that captures X-Instance ──
export async function apiFetch(path, options = {}) {
  const res = await fetch(path, options);
  const xInst = res.headers.get('x-instance');
  if (xInst) setGlobalInstance(xInst);
  return res;
}

// ── Navbar ──
function Navbar() {
  const inst = useInstanceBadge();
  return (
    <nav className="navbar">
      <div className="container navbar-inner">
        <Link to="/" className="navbar-brand">🛍 Shop Catalog</Link>
        <ul className="navbar-links">
          <li><Link to="/">Sản phẩm</Link></li>
          <li><Link to="/products/create">Thêm mới</Link></li>
          <li>
            <Link
              to="/storage"
              style={{
                background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.2), rgba(0, 212, 255, 0.2))',
                border: '1px solid var(--accent)',
                padding: '0.35rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                fontWeight: '600',
                color: 'var(--accent-2)',
              }}
            >
              🗄 MinIO Storage
            </Link>
          </li>
        </ul>
        <div className="instance-badge" title="Backend instance đang phục vụ request gần nhất">
          <span className="instance-dot"></span>
          {inst}
        </div>
      </div>
    </nav>
  );
}

// ── App ──
export default function App() {
  return (
    <>
      <Navbar />
      <main className="container" style={{ paddingTop: '1.5rem', paddingBottom: '3rem' }}>
        <Routes>
          <Route path="/" element={<ProductList />} />
          <Route path="/products/create" element={<CreateProduct />} />
          <Route path="/products/:id" element={<ProductDetail />} />
          <Route path="/storage" element={<StorageDemo />} />
        </Routes>
      </main>
    </>
  );
}
