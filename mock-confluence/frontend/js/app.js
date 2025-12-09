/**
 * Main Application
 *
 * Coordinates all UI components and manages application state.
 */

import * as api from './api.js';
import * as tableEditor from './tableEditor.js';

// ============ State ============

let currentPageId = null;
let currentMode = 'table'; // 'table' or 'html'
let users = [];

// ============ DOM Elements ============

const elements = {
  // Sidebar
  pageList: document.getElementById('pageList'),
  userList: document.getElementById('userList'),
  createPageBtn: document.getElementById('createPageBtn'),
  createUserBtn: document.getElementById('createUserBtn'),

  // Editor
  editorPlaceholder: document.getElementById('editorPlaceholder'),
  editorContent: document.getElementById('editorContent'),
  pageId: document.getElementById('pageId'),
  pageVersion: document.getElementById('pageVersion'),
  pageUpdated: document.getElementById('pageUpdated'),
  pageTitle: document.getElementById('pageTitle'),
  deletePageBtn: document.getElementById('deletePageBtn'),
  savePageBtn: document.getElementById('savePageBtn'),
  versionMessage: document.getElementById('versionMessage'),

  // Mode toggle
  tableModeBtn: document.getElementById('tableModeBtn'),
  htmlModeBtn: document.getElementById('htmlModeBtn'),
  tableEditor: document.getElementById('tableEditor'),
  htmlEditor: document.getElementById('htmlEditor'),
  htmlContent: document.getElementById('htmlContent'),

  // Table controls
  addRowBtn: document.getElementById('addRowBtn'),
  addColBtn: document.getElementById('addColBtn'),
  removeRowBtn: document.getElementById('removeRowBtn'),
  removeColBtn: document.getElementById('removeColBtn'),
  headerRowToggle: document.getElementById('headerRowToggle'),

  // User mention
  userMentionSelect: document.getElementById('userMentionSelect'),
  insertMentionBtn: document.getElementById('insertMentionBtn'),

  // Modals
  createPageModal: document.getElementById('createPageModal'),
  newPageTitle: document.getElementById('newPageTitle'),
  newPageId: document.getElementById('newPageId'),
  confirmCreatePage: document.getElementById('confirmCreatePage'),
  cancelCreatePage: document.getElementById('cancelCreatePage'),
  closeCreateModal: document.getElementById('closeCreateModal'),

  createUserModal: document.getElementById('createUserModal'),
  newUserName: document.getElementById('newUserName'),
  confirmCreateUser: document.getElementById('confirmCreateUser'),
  cancelCreateUser: document.getElementById('cancelCreateUser'),
  closeUserModal: document.getElementById('closeUserModal'),

  // Toast
  toastContainer: document.getElementById('toastContainer'),
};

// ============ Toast Notifications ============

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// ============ Page List ============

async function loadPages() {
  try {
    const pages = await api.getPages();
    renderPageList(pages);
  } catch (error) {
    showToast('Failed to load pages', 'error');
    console.error(error);
  }
}

function renderPageList(pages) {
  elements.pageList.innerHTML = pages
    .map(
      (page) => `
      <div class="page-item ${page.id === currentPageId ? 'active' : ''}" data-id="${page.id}">
        <div class="page-item-title">${escapeHtml(page.title)}</div>
        <div class="page-item-meta">ID: ${page.id} | v${page.version.number}</div>
      </div>
    `
    )
    .join('');

  // Add click handlers
  elements.pageList.querySelectorAll('.page-item').forEach((item) => {
    item.addEventListener('click', () => selectPage(item.dataset.id));
  });
}

// ============ User List ============

async function loadUsers() {
  try {
    users = await api.getUsers();
    renderUserList();
    renderUserMentionSelect();
  } catch (error) {
    showToast('Failed to load users', 'error');
    console.error(error);
  }
}

function renderUserList() {
  elements.userList.innerHTML = users
    .map(
      (user) => `
      <div class="user-item" data-id="${user.id}">
        <span class="user-avatar">${getInitials(user.displayName)}</span>
        <span>${escapeHtml(user.displayName)}</span>
      </div>
    `
    )
    .join('');
}

function renderUserMentionSelect() {
  elements.userMentionSelect.innerHTML =
    '<option value="">Select user...</option>' +
    users.map((user) => `<option value="${user.id}">${escapeHtml(user.displayName)}</option>`).join('');
}

// ============ Page Editor ============

async function selectPage(pageId) {
  try {
    const page = await api.getPage(pageId);
    currentPageId = pageId;

    // Show editor
    elements.editorPlaceholder.style.display = 'none';
    elements.editorContent.style.display = 'block';

    // Update metadata
    elements.pageId.textContent = page.id;
    elements.pageVersion.textContent = page.version.number;
    elements.pageUpdated.textContent = formatDate(page.version.when);
    elements.pageTitle.value = page.title;
    elements.versionMessage.value = '';

    // Load content
    const bodyContent = page.body?.storage?.value || '';

    if (currentMode === 'table') {
      tableEditor.parseHtmlToTable(bodyContent);
    }
    elements.htmlContent.value = bodyContent;

    // Update page list selection
    loadPages();
  } catch (error) {
    showToast('Failed to load page', 'error');
    console.error(error);
  }
}

async function savePage() {
  if (!currentPageId) return;

  try {
    // Get content based on current mode
    let bodyContent;
    if (currentMode === 'table') {
      bodyContent = tableEditor.generateTableHtml();
    } else {
      bodyContent = elements.htmlContent.value;
    }

    const data = {
      title: elements.pageTitle.value,
      bodyContent,
      versionMessage: elements.versionMessage.value,
    };

    await api.updatePage(currentPageId, data);

    showToast('Page saved successfully', 'success');

    // Reload page to get new version
    await selectPage(currentPageId);
    await loadPages();
  } catch (error) {
    showToast('Failed to save page', 'error');
    console.error(error);
  }
}

async function deleteCurrentPage() {
  if (!currentPageId) return;

  if (!confirm('Are you sure you want to delete this page?')) {
    return;
  }

  try {
    await api.deletePage(currentPageId);
    showToast('Page deleted', 'success');

    currentPageId = null;
    elements.editorPlaceholder.style.display = 'flex';
    elements.editorContent.style.display = 'none';

    await loadPages();
  } catch (error) {
    showToast('Failed to delete page', 'error');
    console.error(error);
  }
}

// ============ Create Page ============

function showCreatePageModal() {
  elements.newPageTitle.value = '';
  elements.newPageId.value = '';
  elements.createPageModal.classList.add('active');
  elements.newPageTitle.focus();
}

function hideCreatePageModal() {
  elements.createPageModal.classList.remove('active');
}

async function createNewPage() {
  const title = elements.newPageTitle.value.trim();
  const id = elements.newPageId.value.trim() || null;

  if (!title) {
    showToast('Please enter a title', 'warning');
    return;
  }

  try {
    const defaultContent = `<table>
  <tr>
    <th>Column 1</th>
    <th>Column 2</th>
    <th>Column 3</th>
  </tr>
  <tr>
    <td></td>
    <td></td>
    <td></td>
  </tr>
</table>`;

    const page = await api.createPage(title, defaultContent, id);
    showToast('Page created successfully', 'success');

    hideCreatePageModal();
    await loadPages();
    await selectPage(page.id);
  } catch (error) {
    showToast('Failed to create page', 'error');
    console.error(error);
  }
}

// ============ Create User ============

function showCreateUserModal() {
  elements.newUserName.value = '';
  elements.createUserModal.classList.add('active');
  elements.newUserName.focus();
}

function hideCreateUserModal() {
  elements.createUserModal.classList.remove('active');
}

async function createNewUser() {
  const displayName = elements.newUserName.value.trim();

  if (!displayName) {
    showToast('Please enter a name', 'warning');
    return;
  }

  try {
    await api.createUser(displayName);
    showToast('User added successfully', 'success');

    hideCreateUserModal();
    await loadUsers();
  } catch (error) {
    showToast('Failed to add user', 'error');
    console.error(error);
  }
}

// ============ Mode Toggle ============

function switchMode(mode) {
  if (mode === currentMode) return;

  if (mode === 'html') {
    // Convert table to HTML
    const html = tableEditor.generateTableHtml();
    elements.htmlContent.value = html;

    elements.tableEditor.style.display = 'none';
    elements.htmlEditor.style.display = 'block';
    elements.tableModeBtn.classList.remove('active');
    elements.htmlModeBtn.classList.add('active');
  } else {
    // Parse HTML to table
    tableEditor.parseHtmlToTable(elements.htmlContent.value);

    elements.htmlEditor.style.display = 'none';
    elements.tableEditor.style.display = 'block';
    elements.htmlModeBtn.classList.remove('active');
    elements.tableModeBtn.classList.add('active');
  }

  currentMode = mode;
}

// ============ User Mentions ============

async function insertMention() {
  const userId = elements.userMentionSelect.value;
  if (!userId) {
    showToast('Please select a user', 'warning');
    return;
  }

  try {
    const mentionHtml = await api.getUserMention(userId);
    const inserted = tableEditor.insertUserMention(mentionHtml);

    if (!inserted) {
      showToast('Click inside a table cell first', 'warning');
    } else {
      elements.userMentionSelect.value = '';
    }
  } catch (error) {
    showToast('Failed to insert mention', 'error');
    console.error(error);
  }
}

// ============ Utilities ============

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getInitials(name) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString();
}

// ============ Event Listeners ============

function setupEventListeners() {
  // Page management
  elements.createPageBtn.addEventListener('click', showCreatePageModal);
  elements.closeCreateModal.addEventListener('click', hideCreatePageModal);
  elements.cancelCreatePage.addEventListener('click', hideCreatePageModal);
  elements.confirmCreatePage.addEventListener('click', createNewPage);

  // User management
  elements.createUserBtn.addEventListener('click', showCreateUserModal);
  elements.closeUserModal.addEventListener('click', hideCreateUserModal);
  elements.cancelCreateUser.addEventListener('click', hideCreateUserModal);
  elements.confirmCreateUser.addEventListener('click', createNewUser);

  // Editor actions
  elements.savePageBtn.addEventListener('click', savePage);
  elements.deletePageBtn.addEventListener('click', deleteCurrentPage);

  // Mode toggle
  elements.tableModeBtn.addEventListener('click', () => switchMode('table'));
  elements.htmlModeBtn.addEventListener('click', () => switchMode('html'));

  // Table controls
  elements.addRowBtn.addEventListener('click', tableEditor.addRow);
  elements.addColBtn.addEventListener('click', tableEditor.addColumn);
  elements.removeRowBtn.addEventListener('click', tableEditor.removeRow);
  elements.removeColBtn.addEventListener('click', tableEditor.removeColumn);
  elements.headerRowToggle.addEventListener('change', (e) => {
    tableEditor.toggleHeaderRow(e.target.checked);
  });

  // User mentions
  elements.insertMentionBtn.addEventListener('click', insertMention);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (currentPageId) {
        savePage();
      }
    }
  });

  // Enter to confirm in modals
  elements.newPageTitle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createNewPage();
  });
  elements.newUserName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createNewUser();
  });

  // Close modals on backdrop click
  elements.createPageModal.addEventListener('click', (e) => {
    if (e.target === elements.createPageModal) hideCreatePageModal();
  });
  elements.createUserModal.addEventListener('click', (e) => {
    if (e.target === elements.createUserModal) hideCreateUserModal();
  });
}

// ============ Initialize ============

async function init() {
  console.log('Mock Confluence UI initializing...');

  setupEventListeners();
  tableEditor.initializeTable();

  await Promise.all([loadPages(), loadUsers()]);

  console.log('Mock Confluence UI ready');
}

// Start the app
init().catch(console.error);
