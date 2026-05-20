(function () {
  let session = null;
  let records = [];

  const els = {
    stats: document.getElementById('recordsStats'),
    accountInfo: document.getElementById('accountInfo'),
    logoutButton: document.getElementById('logoutButton'),
    refreshButton: document.getElementById('refreshButton'),
    search: document.getElementById('recordSearch'),
    tableBody: document.getElementById('recordTableBody')
  };

  boot();

  async function boot() {
    session = await loadSession();
    if (!session) return;
    els.accountInfo.textContent = `${session.displayName || session.username}（${session.role === 'admin' ? '管理员' : '普通用户'}）`;
    bindEvents();
    if (session.role !== 'admin') {
      els.stats.textContent = '只有管理员可以查看报价记录';
      els.tableBody.innerHTML = '<tr><td class="empty-record" colspan="6">当前账号没有权限查看报价记录</td></tr>';
      return;
    }
    await loadRecords();
  }

  function bindEvents() {
    els.logoutButton.addEventListener('click', logout);
    els.refreshButton.addEventListener('click', loadRecords);
    els.search.addEventListener('input', renderRecords);
    els.tableBody.addEventListener('click', handleRecordClick);
  }

  async function loadSession() {
    try {
      const response = await fetch('/api/session', { cache: 'no-store' });
      if (!response.ok) throw new Error('unauthorized');
      return await response.json();
    } catch (error) {
      window.location.href = 'login.html';
      return null;
    }
  }

  async function loadRecords() {
    try {
      const response = await fetch('/api/quote-records', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '读取报价记录失败');
      records = Array.isArray(data.records) ? data.records : [];
      renderRecords();
    } catch (error) {
      records = [];
      renderRecords();
      showToast(error.message || '读取报价记录失败');
    }
  }

  function renderRecords() {
    const query = (els.search.value || '').trim().toLowerCase();
    const visible = records.filter((record) => {
      if (!query) return true;
      const text = [
        record.quoteCode,
        record.owner,
        record.ownerDisplayName,
        record.updatedBy,
        record.updatedByDisplayName,
        record.customerCompany,
        record.customerName,
        record.customerPhone
      ].join(' ').toLowerCase();
      return text.includes(query);
    });

    els.stats.textContent = `共 ${records.length} 条报价记录，当前显示 ${visible.length} 条`;
    if (!visible.length) {
      els.tableBody.innerHTML = '<tr><td class="empty-record" colspan="6">暂无报价记录</td></tr>';
      return;
    }

    els.tableBody.innerHTML = visible.map((record) => {
      const customer = [record.customerCompany, record.customerName, record.customerPhone].filter(Boolean).join(' / ') || '未填写客户';
      const updatedBy = record.updatedBy === record.owner
        ? `${record.updatedByDisplayName || record.updatedBy}`
        : `${record.updatedByDisplayName || record.updatedBy}（代编辑）`;
      return `
        <tr>
          <td>
            <strong>${escapeHtml(record.quoteCode || '未生成编号')}</strong>
            <span>${Number(record.itemCount || 0)} 项产品</span>
          </td>
          <td>
            <b>${escapeHtml(record.ownerDisplayName || record.owner)}</b>
            <span>${escapeHtml(record.owner || '')}</span>
          </td>
          <td>
            <b>${escapeHtml(customer)}</b>
            <span>${escapeHtml(record.customerCompany || '')}</span>
          </td>
          <td>
            <b>${money(record.total)}</b>
            <span>门店优惠价优先显示</span>
          </td>
          <td>
            <b>${escapeHtml(updatedBy)}</b>
            <span>${formatDateTime(record.updatedAt)}</span>
          </td>
          <td>
            <div class="record-actions">
              <button class="secondary-button" type="button" data-open-record="${escapeAttr(record.owner)}">查看</button>
              <button class="danger-button" type="button" data-delete-record="${escapeAttr(record.owner)}" data-quote-code="${escapeAttr(record.quoteCode || '')}">删除</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  async function handleRecordClick(event) {
    const openButton = event.target.closest('[data-open-record]');
    if (openButton) {
      localStorage.setItem('ecowaterActiveUser', openButton.dataset.openRecord);
      window.location.href = 'index.html';
      return;
    }

    const deleteButton = event.target.closest('[data-delete-record]');
    if (!deleteButton) return;
    const username = deleteButton.dataset.deleteRecord;
    const quoteCode = deleteButton.dataset.quoteCode || '';
    if (!window.confirm(`确认删除报价记录 ${quoteCode || username}？\n该操作会清空该用户当前保存的报价单，不会删除用户或产品库。`)) return;

    try {
      const response = await fetch('/api/delete-quote-record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, quoteCode })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '删除报价记录失败');
      records = Array.isArray(data.records) ? data.records : records.filter((record) => {
        return !(record.owner === username && (!quoteCode || record.quoteCode === quoteCode));
      });
      renderRecords();
      showToast('报价记录已删除');
    } catch (error) {
      showToast(error.message || '删除报价记录失败');
    }
  }

  async function logout() {
    await fetch('/api/logout', { method: 'POST' }).catch(() => {});
    window.location.href = 'login.html';
  }

  function money(value) {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'CNY',
      maximumFractionDigits: 0
    }).format(Number(value) || 0);
  }

  function formatDateTime(value) {
    const date = new Date(Number(value || 0) * 1000);
    if (Number.isNaN(date.getTime()) || !Number(value)) return '未保存';
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function showToast(message) {
    const old = document.querySelector('.toast');
    if (old) old.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 1600);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }
})();
