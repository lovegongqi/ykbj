(function () {
  const catalog = window.ECOWATER_CATALOG || { products: [], categories: [] };
  const baseProducts = catalog.products || [];
  let customData = { overrides: {}, additions: [], categoryOrder: [], productOrder: [], deletedProductIds: [] };
  let products = [];
  let selectedCategory = '';
  let selectedId = '';
  let isNew = false;
  let session = null;
  let activeUser = '';
  let creatingUser = false;

  const els = {
    stats: document.getElementById('manageStats'),
    accountInfo: document.getElementById('accountInfo'),
    activeUserLabel: document.getElementById('activeUserLabel'),
    activeUserSelect: document.getElementById('activeUserSelect'),
    changePasswordButton: document.getElementById('changePasswordButton'),
    logoutButton: document.getElementById('logoutButton'),
    quoteRecordsLink: document.getElementById('quoteRecordsLink'),
    adminPanel: document.getElementById('adminPanel'),
    userPanel: document.getElementById('userPanel'),
    userList: document.getElementById('userList'),
    newUsername: document.getElementById('newUsername'),
    newPassword: document.getElementById('newPassword'),
    newDisplayName: document.getElementById('newDisplayName'),
    createUserButton: document.getElementById('createUserButton'),
    createUserStatus: document.getElementById('createUserStatus'),
    downloadTemplateButton: document.getElementById('downloadTemplateButton'),
    importProductsButton: document.getElementById('importProductsButton'),
    importProductsInput: document.getElementById('importProductsInput'),
    importStatus: document.getElementById('importStatus'),
    search: document.getElementById('manageSearch'),
    categoryList: document.getElementById('categoryList'),
    productList: document.getElementById('productList'),
    newCategoryButton: document.getElementById('newCategoryButton'),
    deleteCategoryButton: document.getElementById('deleteCategoryButton'),
    moveCategoryUpButton: document.getElementById('moveCategoryUpButton'),
    moveCategoryDownButton: document.getElementById('moveCategoryDownButton'),
    moveProductUpButton: document.getElementById('moveProductUpButton'),
    moveProductDownButton: document.getElementById('moveProductDownButton'),
    newProductButton: document.getElementById('newProductButton'),
    deleteProductButton: document.getElementById('deleteProductButton'),
    saveButton: document.getElementById('saveButton'),
    resetButton: document.getElementById('resetButton'),
    deleteButton: document.getElementById('deleteButton'),
    uploadImageButton: document.getElementById('uploadImageButton'),
    imageUploadInput: document.getElementById('imageUploadInput'),
    editorMode: document.getElementById('editorMode'),
    editorTitle: document.getElementById('editorTitle'),
    form: document.getElementById('productForm'),
    previewImage: document.getElementById('previewImage'),
    previewName: document.getElementById('previewName'),
    previewMeta: document.getElementById('previewMeta'),
    previewPrice: document.getElementById('previewPrice')
  };

  const fields = ['category', 'series', 'name', 'model', 'price', 'productImage', 'details', 'features'];

  boot();

  async function boot() {
    session = await loadSession();
    if (!session) return;
    activeUser = resolveActiveUser();
    renderAccountControls();
    customData = await loadCustomProducts();
    rebuildProducts();
    bindEvents();
    selectedCategory = orderedCategories()[0] || '';
    selectedId = productsInSelectedCategory()[0]?.id || '';
    render();
  }

  function bindEvents() {
    els.changePasswordButton.addEventListener('click', changePassword);
    els.logoutButton.addEventListener('click', logout);
    els.activeUserSelect.addEventListener('change', () => {
      localStorage.setItem('ecowaterActiveUser', els.activeUserSelect.value);
      window.location.reload();
    });
    els.createUserButton?.addEventListener('click', createUser);
    [els.newUsername, els.newPassword, els.newDisplayName].forEach((input) => {
      input?.addEventListener('input', updateCreateUserStatus);
      input?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        createUserIfReady();
      });
    });
    els.adminPanel?.addEventListener('focusout', () => {
      window.setTimeout(() => {
        if (!els.adminPanel.contains(document.activeElement)) createUserIfReady();
      }, 80);
    });
    els.userList.addEventListener('click', handleUserListClick);
    els.downloadTemplateButton.addEventListener('click', downloadImportTemplate);
    els.importProductsButton.addEventListener('click', () => els.importProductsInput.click());
    els.importProductsInput.addEventListener('change', importProductsFile);
    els.search.addEventListener('input', renderLists);
    els.categoryList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-category]');
      if (button) selectCategory(button.dataset.category);
    });
    els.productList.addEventListener('click', (event) => {
      const button = event.target.closest('[data-product-id]');
      if (button) selectProduct(button.dataset.productId);
    });
    els.moveCategoryUpButton.addEventListener('click', () => moveSelectedCategory(-1));
    els.moveCategoryDownButton.addEventListener('click', () => moveSelectedCategory(1));
    els.newCategoryButton.addEventListener('click', createNewCategory);
    els.deleteCategoryButton.addEventListener('click', deleteSelectedCategory);
    els.moveProductUpButton.addEventListener('click', () => moveSelectedProduct(-1));
    els.moveProductDownButton.addEventListener('click', () => moveSelectedProduct(1));
    els.newProductButton.addEventListener('click', () => createNewProduct());
    els.deleteProductButton.addEventListener('click', deleteCurrentProduct);
    els.saveButton.addEventListener('click', saveCurrentProduct);
    els.resetButton.addEventListener('click', resetCurrentProduct);
    els.deleteButton.addEventListener('click', deleteCurrentProduct);
    els.uploadImageButton.addEventListener('click', () => els.imageUploadInput.click());
    els.imageUploadInput.addEventListener('change', uploadSelectedImage);
    fields.forEach((field) => {
      document.getElementById(field).addEventListener('input', updatePreview);
    });
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

  function resolveActiveUser() {
    if (session.role !== 'admin') return session.username;
    const users = session.users || [];
    const saved = localStorage.getItem('ecowaterActiveUser') || session.username;
    return users.some((user) => user.username === saved) ? saved : session.username;
  }

  function renderAccountControls() {
    els.accountInfo.textContent = `${session.displayName || session.username}（${session.role === 'admin' ? '管理员' : '普通用户'}）`;
    if (session.role === 'admin') {
      els.activeUserLabel.hidden = false;
      els.activeUserSelect.innerHTML = (session.users || []).map((user) => {
        const label = `${user.displayName || user.username} / ${user.username}`;
        return `<option value="${escapeAttr(user.username)}">${escapeHtml(label)}</option>`;
      }).join('');
      els.activeUserSelect.value = activeUser;
      els.adminPanel.hidden = false;
      els.userPanel.hidden = false;
      els.quoteRecordsLink.hidden = false;
      renderUserList();
      updateCreateUserStatus();
    } else {
      els.activeUserLabel.hidden = true;
      els.adminPanel.hidden = true;
      els.userPanel.hidden = true;
      els.quoteRecordsLink.hidden = true;
    }
  }

  function renderUserList() {
    const users = session.users || [];
    els.userList.innerHTML = users.map((user) => {
      const active = user.username === activeUser ? ' active' : '';
      const roleText = user.role === 'admin' ? '管理员' : '普通用户';
      const deleteButton = user.role === 'admin'
        ? '<button class="secondary-button" type="button" disabled>不可删除</button>'
        : `<button class="danger-button" type="button" data-delete-user="${escapeAttr(user.username)}">删除</button>`;
      return `
        <div class="user-row${active}">
          <div>
            <strong>${escapeHtml(user.displayName || user.username)}</strong>
            <span>${escapeHtml(user.username)} / ${roleText}</span>
          </div>
          <button class="secondary-button" type="button" data-switch-user="${escapeAttr(user.username)}">切换</button>
          ${deleteButton}
        </div>
      `;
    }).join('');
  }

  async function handleUserListClick(event) {
    const switchButton = event.target.closest('[data-switch-user]');
    if (switchButton) {
      localStorage.setItem('ecowaterActiveUser', switchButton.dataset.switchUser);
      window.location.reload();
      return;
    }

    const deleteButton = event.target.closest('[data-delete-user]');
    if (!deleteButton) return;
    const username = deleteButton.dataset.deleteUser;
    if (!window.confirm(`确认删除用户 ${username}？该用户的独立产品库和报价单也会删除。`)) return;
    await deleteUser(username);
  }

  function apiUrl(path) {
    const query = session.role === 'admin' ? `?user=${encodeURIComponent(activeUser)}` : '';
    return `${path}${query}`;
  }

  async function loadCustomProducts() {
    try {
      const response = await fetch(apiUrl('/api/custom-products'), { cache: 'no-store' });
      if (!response.ok) throw new Error('读取自定义产品失败');
      const data = await response.json();
      return {
        overrides: data.overrides && typeof data.overrides === 'object' ? data.overrides : {},
        additions: Array.isArray(data.additions) ? data.additions : [],
        categoryOrder: normalizeOrder(data.categoryOrder),
        productOrder: normalizeOrder(data.productOrder),
        deletedProductIds: normalizeOrder(data.deletedProductIds)
      };
    } catch (error) {
      return { overrides: {}, additions: [], categoryOrder: [], productOrder: [], deletedProductIds: [] };
    }
  }

  function rebuildProducts() {
    const deletedIds = new Set(normalizeOrder(customData.deletedProductIds));
    products = sortProducts([
      ...baseProducts.filter((product) => !deletedIds.has(product.id)).map((product) => {
        const override = customData.overrides[product.id];
        return normalizeProduct(override ? { ...product, ...override, baseId: product.id } : { ...product, baseId: product.id });
      }),
      ...customData.additions.map((product) => normalizeProduct({ ...product, customOnly: true }))
    ]);
  }

  function render() {
    ensureSelection();
    const userLabel = session.role === 'admin' ? `当前管理：${activeUser}` : `当前账号：${session.username}`;
    els.stats.textContent = `${userLabel}，${products.length} 个产品`;
    renderLists();
    renderForm();
  }

  function renderLists() {
    renderCategoryList();
    renderProductList();
  }

  function renderCategoryList() {
    const query = els.search.value.trim().toLowerCase();
    const categories = orderedCategories().filter((category) => {
      if (!query) return true;
      return category.toLowerCase().includes(query) || products.some((product) => {
        const text = [product.category, product.series, product.name, product.model].join(' ').toLowerCase();
        return product.category === category && text.includes(query);
      });
    });

    els.categoryList.innerHTML = categories.map((category) => {
      const active = category === selectedCategory ? ' class="active"' : '';
      const count = products.filter((product) => product.category === category).length;
      return `
        <button type="button" data-category="${escapeAttr(category)}"${active}>
          <strong>${escapeHtml(category)}</strong>
          <span>${count}</span>
        </button>
      `;
    }).join('') || '<p class="empty">没有匹配类别</p>';
  }

  function renderProductList() {
    const query = els.search.value.trim().toLowerCase();
    const list = productsInSelectedCategory().filter((product) => {
      const text = [product.category, product.series, product.name, product.model].join(' ').toLowerCase();
      return !query || text.includes(query) || product.category.toLowerCase().includes(query);
    });

    els.productList.innerHTML = list.map((product) => {
      const active = product.id === selectedId ? ' class="active"' : '';
      const badge = product.customOnly ? '新增' : customData.overrides[product.id] ? '已修改' : '原始';
      return `
        <button type="button" data-product-id="${escapeAttr(product.id)}"${active}>
          <strong>${escapeHtml(product.name)} ${escapeHtml(product.model)}</strong>
          <span>${escapeHtml(product.series)} / ${badge}</span>
        </button>
      `;
    }).join('') || '<p class="empty">没有匹配产品</p>';
  }

  function selectCategory(category) {
    selectedCategory = category;
    selectedId = productsInSelectedCategory()[0]?.id || '';
    isNew = false;
    render();
  }

  function selectProduct(productId) {
    selectedId = productId;
    const product = currentProduct();
    if (product) selectedCategory = product.category;
    isNew = false;
    renderLists();
    renderForm();
  }

  function renderForm() {
    const product = currentProduct();
    if (!product) {
      els.editorTitle.textContent = '请选择产品';
      fields.forEach((field) => { document.getElementById(field).value = ''; });
      els.saveButton.disabled = true;
      els.resetButton.disabled = true;
      els.deleteButton.disabled = true;
      updatePreview();
      updateSortButtons(null);
      return;
    }

    els.editorMode.textContent = product.customOnly ? '新增产品' : customData.overrides[product.id] ? '编辑产品（已修改）' : '编辑产品';
    els.editorTitle.textContent = `${product.name} ${product.model || ''}`.trim();
    fields.forEach((field) => {
      document.getElementById(field).value = product[field] ?? '';
    });
    els.saveButton.disabled = false;
    els.resetButton.disabled = product.customOnly || !customData.overrides[product.id];
    els.deleteButton.disabled = false;
    updatePreview();
    updateSortButtons(product);
  }

  function createNewProduct(categoryOverride) {
    const category = categoryOverride || selectedCategory || '自定义产品';
    const product = normalizeProduct({
      id: `custom-${timestampId()}`,
      category,
      series: category,
      name: '新产品',
      model: '',
      price: '',
      productImage: '',
      details: '',
      features: '',
      customOnly: true
    });
    customData.additions.unshift(product);
    rebuildProducts();
    selectedCategory = product.category;
    selectedId = product.id;
    isNew = true;
    render();
  }

  function createNewCategory() {
    const category = window.prompt('请输入新增类别名称');
    const name = String(category || '').trim();
    if (!name) return;
    createNewProduct(name);
    showToast('已新增类别，请保存产品信息');
  }

  async function saveCurrentProduct() {
    const product = currentProduct();
    if (!product) return;
    const formProduct = normalizeProduct({ ...product, ...readFormProduct() });

    if (product.customOnly) {
      customData.additions = customData.additions.map((item) => item.id === product.id ? formProduct : item);
    } else {
      customData.overrides[product.id] = formProduct;
    }

    rebuildProducts();
    syncOrderArrays();
    await saveCustomProducts();
    selectedCategory = formProduct.category;
    selectedId = formProduct.id;
    isNew = false;
    render();
    showToast('已保存');
  }

  async function resetCurrentProduct() {
    const product = currentProduct();
    if (!product || product.customOnly) return;
    delete customData.overrides[product.id];
    rebuildProducts();
    syncOrderArrays();
    await saveCustomProducts();
    selectedCategory = currentProduct()?.category || selectedCategory;
    render();
    showToast('已恢复原始');
  }

  async function deleteCurrentProduct() {
    const product = currentProduct();
    if (!product) return;
    const label = [product.category, product.name, product.model].filter(Boolean).join(' / ');
    if (!window.confirm(`确认删除产品 ${label}？该产品会从当前账号的产品库移除。`)) return;
    removeProductFromCustomData(product);
    rebuildProducts();
    syncOrderArrays();
    await saveCustomProducts();
    if (!orderedCategories().includes(selectedCategory)) selectedCategory = orderedCategories()[0] || '';
    selectedId = productsInSelectedCategory()[0]?.id || '';
    render();
    showToast('已删除');
  }

  async function deleteSelectedCategory() {
    if (!selectedCategory) return;
    const categoryProducts = productsInSelectedCategory();
    if (!categoryProducts.length) return;
    if (!window.confirm(`确认删除类别 ${selectedCategory}？该类别下 ${categoryProducts.length} 个产品会从当前账号的产品库移除。`)) return;

    categoryProducts.forEach(removeProductFromCustomData);
    customData.categoryOrder = normalizeOrder(customData.categoryOrder).filter((category) => category !== selectedCategory);
    customData.productOrder = normalizeOrder(customData.productOrder).filter((id) => !categoryProducts.some((product) => product.id === id));
    rebuildProducts();
    syncOrderArrays();
    selectedCategory = orderedCategories()[0] || '';
    selectedId = productsInSelectedCategory()[0]?.id || '';
    await saveCustomProducts();
    render();
    showToast('类别已删除');
  }

  function removeProductFromCustomData(product) {
    customData.additions = customData.additions.filter((item) => item.id !== product.id);
    delete customData.overrides[product.id];
    if (!product.customOnly) {
      customData.deletedProductIds = appendUnique(normalizeOrder(customData.deletedProductIds), [product.id]);
    }
  }

  async function moveSelectedCategory(direction) {
    if (!selectedCategory) return;
    const categories = orderedCategories();
    customData.categoryOrder = moveValue(mergeOrder(customData.categoryOrder, categories), selectedCategory, direction);
    rebuildProducts();
    await saveCustomProducts();
    render();
    showToast('类别排序已保存');
  }

  async function moveSelectedProduct(direction) {
    const product = currentProduct();
    if (!product) return;
    const categoryProductIds = products.filter((item) => item.category === product.category).map((item) => item.id);
    const currentIndex = categoryProductIds.indexOf(product.id);
    const targetId = categoryProductIds[currentIndex + direction];
    if (!targetId) return;

    const order = mergeOrder(customData.productOrder, products.map((item) => item.id));
    const from = order.indexOf(product.id);
    const to = order.indexOf(targetId);
    if (from === -1 || to === -1) return;
    [order[from], order[to]] = [order[to], order[from]];
    customData.productOrder = order;
    rebuildProducts();
    await saveCustomProducts();
    selectedId = product.id;
    render();
    showToast('产品排序已保存');
  }

  async function uploadSelectedImage() {
    const file = els.imageUploadInput.files && els.imageUploadInput.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      showToast('图片不能超过 8MB');
      els.imageUploadInput.value = '';
      return;
    }

    const oldText = els.uploadImageButton.textContent;
    els.uploadImageButton.disabled = true;
    els.uploadImageButton.textContent = '上传中...';

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const response = await fetch('/api/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, dataUrl })
      });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();
      document.getElementById('productImage').value = result.url || '';
      updatePreview();
      showToast('图片已上传，保存后生效');
    } catch (error) {
      console.error(error);
      showToast('图片上传失败');
    } finally {
      els.imageUploadInput.value = '';
      els.uploadImageButton.disabled = false;
      els.uploadImageButton.textContent = oldText;
    }
  }

  async function saveCustomProducts() {
    const response = await fetch(apiUrl('/api/custom-products'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(customData)
    });
    if (!response.ok) throw new Error(await response.text());
  }

  function downloadImportTemplate() {
    window.location.href = '/api/import-template';
  }

  async function importProductsFile() {
    const file = els.importProductsInput.files && els.importProductsInput.files[0];
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) {
      showToast('请选择 .xlsx 文件');
      els.importProductsInput.value = '';
      return;
    }

    const oldText = els.importProductsButton.textContent;
    els.importProductsButton.disabled = true;
    els.importProductsButton.textContent = '导入中...';
    els.importStatus.textContent = '';

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const response = await fetch(apiUrl('/api/import-products'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, dataUrl })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || '导入失败');

      customData = await loadCustomProducts();
      rebuildProducts();
      selectedCategory = orderedCategories()[0] || '';
      selectedId = productsInSelectedCategory()[0]?.id || '';
      render();
      const message = `导入 ${result.imported || 0} 个，新增 ${result.created || 0} 个，更新 ${result.updated || 0} 个`;
      els.importStatus.textContent = message;
      showToast(message);
      if (result.errors && result.errors.length) {
        console.warn('导入提示', result.errors);
      }
    } catch (error) {
      els.importStatus.textContent = error.message || '导入失败';
      showToast(error.message || '导入失败');
    } finally {
      els.importProductsInput.value = '';
      els.importProductsButton.disabled = false;
      els.importProductsButton.textContent = oldText;
    }
  }

  async function createUser() {
    if (creatingUser) return;
    try {
      const username = els.newUsername.value.trim();
      const password = els.newPassword.value.trim();
      const displayName = els.newDisplayName.value.trim();
      if (!username) {
        updateCreateUserStatus('请输入账号');
        return;
      }
      if (password.length < 4) {
        updateCreateUserStatus('密码至少 4 位');
        return;
      }
      if ((session.users || []).some((user) => user.username === username)) {
        updateCreateUserStatus('账号已存在');
        return;
      }
      creatingUser = true;
      updateCreateUserStatus('正在自动保存...');
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, displayName })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '新增用户失败');
      session.users = data.users || session.users || [];
      activeUser = username;
      localStorage.setItem('ecowaterActiveUser', activeUser);
      els.newUsername.value = '';
      els.newPassword.value = '';
      els.newDisplayName.value = '';
      updateCreateUserStatus('已自动保存');
      renderAccountControls();
      customData = await loadCustomProducts();
      rebuildProducts();
      selectedCategory = orderedCategories()[0] || '';
      selectedId = productsInSelectedCategory()[0]?.id || '';
      render();
      showToast('用户已新增并保存');
    } catch (error) {
      updateCreateUserStatus(error.message || '新增用户失败');
      showToast(error.message || '新增用户失败');
    } finally {
      creatingUser = false;
    }
  }

  function createUserIfReady() {
    const username = els.newUsername.value.trim();
    const password = els.newPassword.value.trim();
    if (!username && !password && !els.newDisplayName.value.trim()) {
      updateCreateUserStatus();
      return;
    }
    if (!username || password.length < 4) {
      updateCreateUserStatus();
      return;
    }
    createUser();
  }

  function updateCreateUserStatus(message) {
    if (!els.createUserStatus) return;
    if (message) {
      els.createUserStatus.textContent = message;
      return;
    }
    const username = els.newUsername.value.trim();
    const password = els.newPassword.value.trim();
    if (!username && !password && !els.newDisplayName.value.trim()) {
      els.createUserStatus.textContent = '填写账号和密码后自动保存';
    } else if (!username) {
      els.createUserStatus.textContent = '请输入账号';
    } else if (password.length < 4) {
      els.createUserStatus.textContent = '密码至少 4 位';
    } else if ((session.users || []).some((user) => user.username === username)) {
      els.createUserStatus.textContent = '账号已存在';
    } else {
      els.createUserStatus.textContent = '离开输入区后自动保存';
    }
  }

  async function deleteUser(username) {
    try {
      const response = await fetch('/api/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '删除用户失败');
      session.users = data.users || session.users || [];
      if (activeUser === username) {
        activeUser = 'admin';
        localStorage.setItem('ecowaterActiveUser', activeUser);
      }
      showToast('用户已删除');
      window.location.reload();
    } catch (error) {
      showToast(error.message || '删除用户失败');
    }
  }

  async function changePassword() {
    const oldPassword = window.prompt('请输入原密码');
    if (oldPassword === null) return;
    const newPassword = window.prompt('请输入新密码（至少 4 位）');
    if (newPassword === null) return;
    const confirmPassword = window.prompt('请再次输入新密码');
    if (confirmPassword === null) return;
    if (newPassword !== confirmPassword) {
      showToast('两次新密码不一致');
      return;
    }
    try {
      const response = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '修改密码失败');
      showToast('密码已修改');
    } catch (error) {
      showToast(error.message || '修改密码失败');
    }
  }

  async function logout() {
    await fetch('/api/logout', { method: 'POST' }).catch(() => {});
    window.location.href = 'login.html';
  }

  function currentProduct() {
    return products.find((product) => product.id === selectedId) || null;
  }

  function productsInSelectedCategory() {
    return products.filter((product) => product.category === selectedCategory);
  }

  function ensureSelection() {
    const categories = orderedCategories();
    if (!selectedCategory || !categories.includes(selectedCategory)) {
      selectedCategory = categories[0] || '';
    }
    const categoryProducts = productsInSelectedCategory();
    if (!categoryProducts.some((product) => product.id === selectedId)) {
      selectedId = categoryProducts[0]?.id || '';
    }
  }

  function sortProducts(items) {
    const categoryIndex = orderIndex(customData.categoryOrder);
    const productIndex = orderIndex(customData.productOrder);
    return [...items].sort((a, b) => {
      const categoryOrder = compareOrder(categoryIndex, a.category, b.category);
      if (categoryOrder !== 0) return categoryOrder;
      const categoryText = a.category.localeCompare(b.category, 'zh-CN', { numeric: true });
      if (categoryText !== 0) return categoryText;

      const productOrder = compareOrder(productIndex, a.id, b.id);
      if (productOrder !== 0) return productOrder;
      return `${a.series}${a.name}${a.model}`.localeCompare(`${b.series}${b.name}${b.model}`, 'zh-CN', { numeric: true });
    });
  }

  function orderedCategories() {
    const categories = [...new Set(products.map((product) => product.category).filter(Boolean))];
    const categoryIndex = orderIndex(customData.categoryOrder);
    return categories.sort((a, b) => compareOrder(categoryIndex, a, b) || a.localeCompare(b, 'zh-CN', { numeric: true }));
  }

  function updateSortButtons(product) {
    const categories = orderedCategories();
    const categoryIndex = selectedCategory ? categories.indexOf(selectedCategory) : -1;
    const sameCategoryProducts = selectedCategory ? productsInSelectedCategory() : [];
    const productIndex = product ? sameCategoryProducts.findIndex((item) => item.id === product.id) : -1;

    els.deleteCategoryButton.disabled = categoryIndex === -1 || !sameCategoryProducts.length;
    els.deleteProductButton.disabled = !product;
    els.moveCategoryUpButton.disabled = categoryIndex <= 0;
    els.moveCategoryDownButton.disabled = categoryIndex === -1 || categoryIndex >= categories.length - 1;
    els.moveProductUpButton.disabled = productIndex <= 0;
    els.moveProductDownButton.disabled = productIndex === -1 || productIndex >= sameCategoryProducts.length - 1;
  }

  function syncOrderArrays() {
    customData.categoryOrder = mergeOrder(customData.categoryOrder, orderedCategories());
    customData.productOrder = mergeOrder(customData.productOrder, products.map((product) => product.id));
    customData.deletedProductIds = normalizeOrder(customData.deletedProductIds);
  }

  function moveValue(values, value, direction) {
    const list = [...values];
    const index = list.indexOf(value);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= list.length) return list;
    [list[index], list[target]] = [list[target], list[index]];
    return list;
  }

  function mergeOrder(order, values) {
    const valueSet = new Set(values);
    const merged = normalizeOrder(order).filter((value) => valueSet.has(value));
    values.forEach((value) => {
      if (value && !merged.includes(value)) merged.push(value);
    });
    return merged;
  }

  function appendUnique(order, values) {
    const merged = normalizeOrder(order);
    values.forEach((value) => {
      if (value && !merged.includes(value)) merged.push(value);
    });
    return merged;
  }

  function normalizeOrder(value) {
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : [];
  }

  function orderIndex(order) {
    return new Map(normalizeOrder(order).map((value, index) => [value, index]));
  }

  function compareOrder(index, a, b) {
    const aIndex = index.has(a) ? index.get(a) : Number.MAX_SAFE_INTEGER;
    const bIndex = index.has(b) ? index.get(b) : Number.MAX_SAFE_INTEGER;
    return aIndex === bIndex ? 0 : aIndex - bIndex;
  }

  function readFormProduct() {
    const product = {};
    fields.forEach((field) => {
      product[field] = document.getElementById(field).value.trim();
    });
    product.price = product.price === '' ? null : Number(product.price);
    return product;
  }

  function updatePreview() {
    const product = readFormProduct();
    const image = product.productImage;
    els.previewImage.innerHTML = image ? `<img src="${escapeAttr(image)}" alt="">` : '暂无图片';
    els.previewName.textContent = `${product.name || '未命名产品'} ${product.model || ''}`.trim();
    els.previewMeta.textContent = `${product.category || '未分类'} / ${product.series || '未分系列'}`;
    els.previewPrice.textContent = product.price === null || Number.isNaN(product.price) ? '暂无挂牌价' : money(product.price);
  }

  function normalizeProduct(product) {
    return {
      id: product.id || `custom-${timestampId()}`,
      category: product.category || '自定义产品',
      series: product.series || product.category || '自定义产品',
      name: product.name || '未命名产品',
      model: product.model || '',
      price: product.price === '' || product.price === null || product.price === undefined ? null : Number(product.price),
      productImage: product.productImage || '',
      details: product.details || '',
      features: product.features || '',
      customOnly: Boolean(product.customOnly)
    };
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => resolve(reader.result));
      reader.addEventListener('error', () => reject(reader.error || new Error('读取图片失败')));
      reader.readAsDataURL(file);
    });
  }

  function timestampId() {
    const now = new Date();
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  }

  function pad(value) {
    return String(value).padStart(2, '0');
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
