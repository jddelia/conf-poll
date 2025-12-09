/**
 * API Client
 *
 * Functions for communicating with the mock server admin API.
 */

const API_BASE = '/admin';

/**
 * Make an API request
 */
async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  };

  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(url, config);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

// ============ Pages ============

export async function getPages() {
  const data = await request('/pages');
  return data.pages;
}

export async function getPage(pageId) {
  return await request(`/pages/${pageId}`);
}

export async function createPage(title, bodyContent, id = null) {
  return await request('/pages', {
    method: 'POST',
    body: { title, bodyContent, id },
  });
}

export async function updatePage(pageId, data) {
  return await request(`/pages/${pageId}`, {
    method: 'PUT',
    body: data,
  });
}

export async function deletePage(pageId) {
  return await request(`/pages/${pageId}`, {
    method: 'DELETE',
  });
}

export async function getPageVersions(pageId, limit = 10) {
  const data = await request(`/pages/${pageId}/versions?limit=${limit}`);
  return data.versions;
}

// ============ Users ============

export async function getUsers() {
  const data = await request('/users');
  return data.users;
}

export async function getUser(userId) {
  return await request(`/users/${userId}`);
}

export async function createUser(displayName) {
  return await request('/users', {
    method: 'POST',
    body: { displayName },
  });
}

export async function deleteUser(userId) {
  return await request(`/users/${userId}`, {
    method: 'DELETE',
  });
}

export async function getUserMention(userId) {
  const data = await request(`/users/${userId}/mention`);
  return data.mention;
}

export default {
  getPages,
  getPage,
  createPage,
  updatePage,
  deletePage,
  getPageVersions,
  getUsers,
  getUser,
  createUser,
  deleteUser,
  getUserMention,
};
