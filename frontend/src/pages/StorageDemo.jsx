import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../App.jsx';

export default function StorageDemo() {
  const [buckets, setBuckets] = useState([]);
  const [selectedBucket, setSelectedBucket] = useState('buoi9-assets');
  const [files, setFiles] = useState([]);
  const [prefixFilter, setPrefixFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState(null);

  // Form upload state
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadPrefix, setUploadPrefix] = useState('avatars/');
  const [customKey, setCustomKey] = useState('');
  const [uploading, setUploading] = useState(false);

  // Modal Presigned URL state
  const [presignedData, setPresignedData] = useState(null);

  // Modal Rename state
  const [renameTarget, setRenameTarget] = useState(null);
  const [newKeyInput, setNewKeyInput] = useState('');

  // Modal Move state
  const [moveTarget, setMoveTarget] = useState(null);
  const [moveDestBucket, setMoveDestBucket] = useState('buoi9-assets-archive');

  const showAlert = (type, message) => {
    setAlert({ type, message });
    setTimeout(() => {
      setAlert((curr) => (curr?.message === message ? null : curr));
    }, 6000);
  };

  // 1. Tải danh sách buckets
  const loadBuckets = useCallback(async () => {
    try {
      const res = await apiFetch('/api/buckets');
      const data = await res.json();
      if (data.success) {
        setBuckets(data.data || []);
      }
    } catch (err) {
      console.error('Lỗi tải buckets:', err);
    }
  }, []);

  // 2. Tải danh sách files trong bucket được chọn
  const loadFiles = useCallback(async (bucketName) => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/files?bucket=${encodeURIComponent(bucketName)}`);
      const data = await res.json();
      if (data.success) {
        setFiles(data.data || []);
      } else {
        showAlert('error', data.message || 'Lỗi khi tải danh sách files');
        setFiles([]);
      }
    } catch (err) {
      showAlert('error', 'Không thể kết nối đến backend API');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBuckets();
  }, [loadBuckets]);

  useEffect(() => {
    if (selectedBucket) {
      loadFiles(selectedBucket);
    }
  }, [selectedBucket, loadFiles]);

  // Thao tác Upload file
  const handleUpload = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      showAlert('error', 'Vui lòng chọn một file để upload.');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('bucket', selectedBucket);
    formData.append('prefix', uploadPrefix);
    if (customKey.trim()) {
      formData.append('customKey', customKey.trim());
    }

    try {
      const res = await apiFetch('/api/files', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        showAlert('success', `Upload thành công object: ${data.data.key}`);
        setUploadFile(null);
        setCustomKey('');
        // Reset file input element
        const fileInput = document.getElementById('file-upload-input');
        if (fileInput) fileInput.value = '';
        loadFiles(selectedBucket);
        loadBuckets();
      } else {
        showAlert('error', data.message || 'Upload thất bại');
      }
    } catch (err) {
      showAlert('error', 'Lỗi kết nối khi upload');
    } finally {
      setUploading(false);
    }
  };

  // Tạo Presigned URL
  const handleGetPresignedUrl = async (file) => {
    try {
      const res = await apiFetch(`/api/files/${encodeURIComponent(file.id)}/url?expiry=300`);
      const data = await res.json();
      if (data.success) {
        setPresignedData(data.data);
      } else {
        showAlert('error', data.message || 'Lỗi tạo Presigned URL');
      }
    } catch (err) {
      showAlert('error', 'Không thể kết nối để tạo Presigned URL');
    }
  };

  // Đổi tên object
  const handleRename = async () => {
    if (!renameTarget || !newKeyInput.trim()) return;
    try {
      const res = await apiFetch(`/api/files/${encodeURIComponent(renameTarget.id)}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newKey: newKeyInput.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        showAlert('success', `Đã đổi tên object thành: ${newKeyInput.trim()}`);
        setRenameTarget(null);
        setNewKeyInput('');
        loadFiles(selectedBucket);
      } else {
        showAlert('error', data.message || 'Lỗi đổi tên object');
      }
    } catch (err) {
      showAlert('error', 'Không thể kết nối để đổi tên object');
    }
  };

  // Di chuyển object giữa các bucket
  const handleMove = async () => {
    if (!moveTarget || !moveDestBucket) return;
    try {
      const res = await apiFetch(`/api/files/${encodeURIComponent(moveTarget.id)}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetBucket: moveDestBucket, targetKey: moveTarget.key }),
      });
      const data = await res.json();
      if (data.success) {
        showAlert('success', `Đã di chuyển object sang bucket "${moveDestBucket}"`);
        setMoveTarget(null);
        loadFiles(selectedBucket);
        loadBuckets();
      } else {
        showAlert('error', data.message || 'Lỗi di chuyển object');
      }
    } catch (err) {
      showAlert('error', 'Không thể kết nối để di chuyển object');
    }
  };

  // Xóa object
  const handleDelete = async (file) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa object "${file.key}" khỏi bucket "${file.bucket}"?`)) {
      return;
    }
    try {
      const res = await apiFetch(`/api/files/${encodeURIComponent(file.id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        showAlert('success', `Đã xóa object "${file.key}"`);
        loadFiles(selectedBucket);
        loadBuckets();
      } else {
        showAlert('error', data.message || 'Lỗi xóa object');
      }
    } catch (err) {
      showAlert('error', 'Không thể kết nối để xóa object');
    }
  };

  // Quick Seed: Tạo file mẫu demo nhanh
  const handleQuickSeed = async (type) => {
    setUploading(true);
    try {
      let fileName, content, mime, prefix;
      if (type === 'avatar') {
        prefix = 'avatars/';
        fileName = `avatar-${Date.now().toString().slice(-4)}.svg`;
        content = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="#6c63ff"/><circle cx="50" cy="40" r="18" fill="#ffffff"/><path d="M25 80 C25 62, 75 62, 75 80" fill="#ffffff"/></svg>`;
        mime = 'image/svg+xml';
      } else if (type === 'document') {
        prefix = 'documents/';
        fileName = `tailieu-${Date.now().toString().slice(-4)}.pdf`;
        content = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000115 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n200\n%%EOF`;
        mime = 'application/pdf';
      } else if (type === 'public') {
        prefix = 'public/';
        fileName = `public-announcement-${Date.now().toString().slice(-4)}.txt`;
        content = `[THÔNG BÁO CÔNG KHAI - BUỔI 9]\nĐây là file public trong prefix public/.\nBất kỳ ai cũng có thể đọc trực tiếp không cần Presigned URL qua minio.shop.local!`;
        mime = 'text/plain; charset=utf-8';
      } else {
        prefix = 'private/';
        fileName = `confidential-data-${Date.now().toString().slice(-4)}.txt`;
        content = `[TÀI LIỆU MẬT - BUỔI 9]\nĐây là file private.\nTruy cập trực tiếp sẽ bị MinIO từ chối (HTTP 403 Forbidden).\nBắt buộc phải dùng Presigned URL còn hiệu lực!`;
        mime = 'text/plain; charset=utf-8';
      }

      const blob = new Blob([content], { type: mime });
      const file = new File([blob], fileName, { type: mime });

      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', selectedBucket);
      formData.append('prefix', prefix);

      const res = await apiFetch('/api/files', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        showAlert('success', `Đã tạo mẫu thành công: ${data.data.key}`);
        loadFiles(selectedBucket);
        loadBuckets();
      } else {
        showAlert('error', data.message || 'Lỗi tạo file mẫu');
      }
    } catch (err) {
      showAlert('error', 'Lỗi khi tạo file mẫu');
    } finally {
      setUploading(false);
    }
  };

  // Test kiểm tra quyền Anonymous GetObject
  const testAnonymousAccess = async (file) => {
    const directUrl = `http://minio.shop.local/${file.bucket}/${file.key}`;
    try {
      const res = await fetch(directUrl, { method: 'GET', mode: 'no-cors' });
      // Thử fetch head nếu có CORS, hoặc alert hướng dẫn
      window.open(directUrl, '_blank');
    } catch (e) {
      window.open(directUrl, '_blank');
    }
  };

  // Filter files
  const filteredFiles = files.filter((f) => {
    if (prefixFilter === 'all') return true;
    return f.prefix === `${prefixFilter}/` || f.key.startsWith(`${prefixFilter}/`);
  });

  return (
    <div className="storage-page">
      {/* ── Header ── */}
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: '700', color: 'var(--text-1)' }}>
            🗄 MinIO Object Storage (S3 API)
          </h1>
          <p style={{ color: 'var(--text-2)', fontSize: '0.95rem' }}>
            Quản lý Bucket, Upload Avatar, Tài liệu, Presigned URL & Phân quyền Public / Private theo chuẩn AWS S3
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <a
            href="http://127.0.0.1:9091"
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
            title="Truy cập giao diện quản trị MinIO Console"
          >
            🖥 MinIO Console (:9091)
          </a>
          <button onClick={() => { loadBuckets(); loadFiles(selectedBucket); }} className="btn btn-secondary" title="Làm mới">
            🔄 Làm mới
          </button>
        </div>
      </div>

      {/* ── Alert Toast ── */}
      {alert && (
        <div
          className={`alert ${alert.type === 'success' ? 'alert-success' : 'alert-error'}`}
          style={{
            padding: '1rem',
            borderRadius: 'var(--radius-sm)',
            marginBottom: '1.5rem',
            background: alert.type === 'success' ? 'rgba(6, 214, 160, 0.15)' : 'rgba(255, 77, 109, 0.15)',
            border: `1px solid ${alert.type === 'success' ? 'var(--success)' : 'var(--danger)'}`,
            color: alert.type === 'success' ? 'var(--success)' : 'var(--danger)',
          }}
        >
          {alert.type === 'success' ? '✅ ' : '❌ '}
          {alert.message}
        </div>
      )}

      {/* ── Bucket Selection Tabs ── */}
      <div className="bucket-tabs" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
        {['buoi9-assets', 'buoi9-assets-archive'].map((bName) => {
          const bInfo = buckets.find((b) => b.bucket === bName);
          const isSelected = selectedBucket === bName;
          return (
            <button
              key={bName}
              onClick={() => setSelectedBucket(bName)}
              className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                flex: 1,
                padding: '0.9rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                background: isSelected ? 'var(--bg-2)' : 'var(--bg-1)',
              }}
            >
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: '600', fontSize: '1.05rem' }}>📦 {bName}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>
                  {bName === 'buoi9-assets' ? 'Bucket chính (Active Assets)' : 'Bucket lưu trữ (Archive)'}
                </div>
              </div>
              <span
                style={{
                  background: isSelected ? 'var(--accent)' : 'var(--bg-card)',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '12px',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                }}
              >
                {bInfo ? `${bInfo.objectCount} objects` : '—'}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Quick Seed Bar (Tạo mẫu nhanh cho demo trên lớp) ── */}
      <div
        style={{
          background: 'var(--bg-1)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '1rem 1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
        }}
      >
        <div>
          <span style={{ fontWeight: '600', color: 'var(--accent-2)', fontSize: '0.9rem' }}>
            ⚡ Thao tác mẫu nhanh cho thuyết trình:
          </span>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>
            Tự động tạo và upload các file mẫu vào bucket <strong>{selectedBucket}</strong>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button onClick={() => handleQuickSeed('avatar')} disabled={uploading} className="btn btn-secondary btn-sm">
            👤 + Avatar mẫu
          </button>
          <button onClick={() => handleQuickSeed('document')} disabled={uploading} className="btn btn-secondary btn-sm">
            📄 + PDF mẫu
          </button>
          <button onClick={() => handleQuickSeed('public')} disabled={uploading} className="btn btn-secondary btn-sm">
            🌐 + File Public
          </button>
          <button onClick={() => handleQuickSeed('private')} disabled={uploading} className="btn btn-secondary btn-sm">
            🔒 + File Private
          </button>
        </div>
      </div>

      {/* ── Upload Section Card ── */}
      <div
        style={{
          background: 'var(--bg-1)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '1.25rem',
          marginBottom: '1.5rem',
        }}
      >
        <h3 style={{ fontSize: '1.1rem', marginBottom: '0.75rem', color: 'var(--text-1)' }}>
          📤 Upload Object lên bucket <code>{selectedBucket}</code>
        </h3>
        <form onSubmit={handleUpload} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          {/* Nhóm thư mục ảo (Prefix) */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-2)', marginBottom: '0.3rem' }}>
              Prefix (Thư mục ảo)
            </label>
            <select
              value={uploadPrefix}
              onChange={(e) => setUploadPrefix(e.target.value)}
              className="form-control"
              style={{
                width: '100%',
                padding: '0.6rem',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-2)',
                color: 'var(--text-1)',
                border: '1px solid var(--border)',
              }}
            >
              <option value="avatars/">avatars/ (Ảnh đại diện - Private)</option>
              <option value="documents/">documents/ (Tài liệu PDF - Private)</option>
              <option value="public/">public/ (Công khai không cần ký URL)</option>
              <option value="private/">private/ (Bảo mật cần Presigned URL)</option>
            </select>
          </div>

          {/* Chọn File */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-2)', marginBottom: '0.3rem' }}>
              Chọn File (Ảnh, PDF, TXT, ...)
            </label>
            <input
              id="file-upload-input"
              type="file"
              onChange={(e) => setUploadFile(e.target.files[0] || null)}
              className="form-control"
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-2)',
                color: 'var(--text-1)',
                border: '1px solid var(--border)',
              }}
            />
          </div>

          {/* Tên Key tùy chọn */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-2)', marginBottom: '0.3rem' }}>
              Tên file tùy chỉnh (tùy chọn)
            </label>
            <input
              type="text"
              placeholder="Để trống sẽ dùng tên gốc"
              value={customKey}
              onChange={(e) => setCustomKey(e.target.value)}
              className="form-control"
              style={{
                width: '100%',
                padding: '0.6rem',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-2)',
                color: 'var(--text-1)',
                border: '1px solid var(--border)',
              }}
            />
          </div>

          {/* Nút Upload */}
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              type="submit"
              disabled={uploading || !uploadFile}
              className="btn btn-primary"
              style={{ width: '100%', padding: '0.65rem', fontWeight: '600' }}
            >
              {uploading ? '⏳ Đang upload...' : '🚀 Bắt đầu Upload'}
            </button>
          </div>
        </form>
      </div>

      {/* ── Objects List Card ── */}
      <div
        style={{
          background: 'var(--bg-1)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', color: 'var(--text-1)' }}>
              Danh sách Objects trong <code>{selectedBucket}</code> ({filteredFiles.length})
            </h3>
          </div>
          {/* Bộ lọc Prefix */}
          <div style={{ display: 'flex', gap: '0.4rem', fontSize: '0.85rem' }}>
            {['all', 'avatars', 'documents', 'public', 'private'].map((pf) => (
              <button
                key={pf}
                onClick={() => setPrefixFilter(pf)}
                className={`btn btn-sm ${prefixFilter === pf ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
              >
                {pf === 'all' ? 'Tất cả' : `${pf}/`}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-2)' }}>
            ⏳ Đang tải danh sách objects từ MinIO...
          </div>
        ) : filteredFiles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-2)' }}>
            Chưa có object nào trong bucket này. Hãy upload một file hoặc bấm các nút <strong>Thao tác mẫu nhanh</strong> phía trên!
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-2)' }}>
                  <th style={{ padding: '0.75rem' }}>Object Key</th>
                  <th style={{ padding: '0.75rem' }}>Quyền truy cập</th>
                  <th style={{ padding: '0.75rem' }}>Dung lượng</th>
                  <th style={{ padding: '0.75rem' }}>Thời gian</th>
                  <th style={{ padding: '0.75rem', textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredFiles.map((file) => {
                  const isPublic = file.isPublic;
                  return (
                    <tr
                      key={file.id}
                      style={{
                        borderBottom: '1px solid rgba(42, 48, 88, 0.4)',
                        transition: 'background 0.2s',
                      }}
                    >
                      <td style={{ padding: '0.75rem', fontWeight: '500' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span>{file.key.endsWith('.pdf') ? '📄' : file.key.endsWith('.svg') || file.key.endsWith('.png') || file.key.endsWith('.jpg') ? '🖼' : '📁'}</span>
                          <span style={{ fontFamily: 'monospace', color: 'var(--text-1)' }}>{file.key}</span>
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        {isPublic ? (
                          <span
                            style={{
                              background: 'rgba(6, 214, 160, 0.15)',
                              color: 'var(--success)',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                            }}
                          >
                            🌐 Public
                          </span>
                        ) : (
                          <span
                            style={{
                              background: 'rgba(255, 77, 109, 0.15)',
                              color: 'var(--danger)',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: '600',
                            }}
                          >
                            🔒 Private (Ký URL)
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem', color: 'var(--text-2)' }}>
                        {(file.size / 1024).toFixed(1)} KB
                      </td>
                      <td style={{ padding: '0.75rem', color: 'var(--text-2)', fontSize: '0.8rem' }}>
                        {new Date(file.lastModified).toLocaleString('vi-VN')}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {/* Tải về */}
                          <a
                            href={`/api/files/${encodeURIComponent(file.id)}/download`}
                            className="btn btn-secondary btn-sm"
                            title="Tải về trực tiếp qua backend stream"
                            download
                          >
                            📥 Tải
                          </a>

                          {/* Tạo Presigned URL */}
                          <button
                            onClick={() => handleGetPresignedUrl(file)}
                            className="btn btn-primary btn-sm"
                            title="Tạo Presigned URL (hiệu lực 300s)"
                          >
                            🔑 Ký URL
                          </button>

                          {/* Test Public/Private qua NGINX */}
                          <button
                            onClick={() => testAnonymousAccess(file)}
                            className="btn btn-secondary btn-sm"
                            title="Thử truy cập trực tiếp qua minio.shop.local (Kiểm tra Anonymous)"
                          >
                            👁 Thử URL
                          </button>

                          {/* Đổi tên */}
                          <button
                            onClick={() => {
                              setRenameTarget(file);
                              setNewKeyInput(file.key);
                            }}
                            className="btn btn-secondary btn-sm"
                            title="Đổi tên object trong cùng bucket"
                          >
                            ✏️
                          </button>

                          {/* Di chuyển */}
                          <button
                            onClick={() => {
                              setMoveTarget(file);
                              setMoveDestBucket(
                                file.bucket === 'buoi9-assets' ? 'buoi9-assets-archive' : 'buoi9-assets'
                              );
                            }}
                            className="btn btn-secondary btn-sm"
                            title="Di chuyển sang bucket khác"
                          >
                            🔄
                          </button>

                          {/* Xóa */}
                          <button
                            onClick={() => handleDelete(file)}
                            className="btn btn-danger btn-sm"
                            title="Xóa object khỏi bucket"
                          >
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal: Presigned URL Result ── */}
      {presignedData && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: 'var(--radius)', maxWidth: '650px', width: '90%', border: '1px solid var(--border)' }}>
            <h3 style={{ marginBottom: '0.75rem', color: 'var(--accent-2)' }}>
              🔑 Presigned URL cho <code>{presignedData.key}</code>
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', marginBottom: '1rem' }}>
              URL được ký điện tử bằng chuẩn <strong>AWS S3 Signature V4</strong> qua hostname <code>minio.shop.local</code>. Có hiệu lực trong {presignedData.expiresIn} giây (hết hạn lúc {new Date(presignedData.expiresAt).toLocaleTimeString()}).
            </p>
            <div style={{ background: 'var(--bg-0)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '0.8rem', marginBottom: '1rem', border: '1px solid var(--border)' }}>
              {presignedData.presignedUrl}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(presignedData.presignedUrl);
                  showAlert('success', 'Đã copy Presigned URL vào clipboard!');
                }}
                className="btn btn-secondary"
              >
                📋 Copy URL
              </button>
              <a
                href={presignedData.presignedUrl}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary"
              >
                🌐 Mở Presigned URL
              </a>
              <button onClick={() => setPresignedData(null)} className="btn btn-secondary">
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Rename Object ── */}
      {renameTarget && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: 'var(--radius)', maxWidth: '500px', width: '90%', border: '1px solid var(--border)' }}>
            <h3 style={{ marginBottom: '0.75rem' }}>✏️ Đổi tên Object</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', marginBottom: '1rem' }}>
              Trong MinIO / S3, thao tác đổi tên thực hiện theo quy trình: <strong>Copy sang key mới → Xác minh đích → Xóa key cũ</strong>.
            </p>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-2)', marginBottom: '0.3rem' }}>
                Key mới (bao gồm prefix):
              </label>
              <input
                type="text"
                value={newKeyInput}
                onChange={(e) => setNewKeyInput(e.target.value)}
                className="form-control"
                style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', background: 'var(--bg-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setRenameTarget(null)} className="btn btn-secondary">Hủy</button>
              <button onClick={handleRename} className="btn btn-primary">Xác nhận Đổi tên</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Move Object ── */}
      {moveTarget && (
        <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: 'var(--radius)', maxWidth: '500px', width: '90%', border: '1px solid var(--border)' }}>
            <h3 style={{ marginBottom: '0.75rem' }}>🔄 Di chuyển Object sang Bucket khác</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-2)', marginBottom: '1rem' }}>
              Di chuyển object <code>{moveTarget.key}</code> từ <strong>{moveTarget.bucket}</strong> sang bucket đích:
            </p>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-2)', marginBottom: '0.3rem' }}>
                Bucket đích:
              </label>
              <select
                value={moveDestBucket}
                onChange={(e) => setMoveDestBucket(e.target.value)}
                className="form-control"
                style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-sm)', background: 'var(--bg-2)', color: 'var(--text-1)', border: '1px solid var(--border)' }}
              >
                <option value="buoi9-assets">buoi9-assets</option>
                <option value="buoi9-assets-archive">buoi9-assets-archive</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setMoveTarget(null)} className="btn btn-secondary">Hủy</button>
              <button onClick={handleMove} className="btn btn-primary">Xác nhận Di chuyển</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
