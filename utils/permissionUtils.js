// utils/permissionUtils.js

import { PERMISSIONS } from './types.js';
import browser from 'webextension-polyfill';

export async function validatePermissions(required) {
  const permissions = await browser.permissions.getAll();
  return required.every(p => permissions.permissions?.includes(p));
}

export async function requestPermissions(permissions) {
  try {
    const granted = await browser.permissions.request({ permissions });
    return granted;
  } catch (error) {
    console.error('Permission request failed:', error);
    return false;
  }
}

export async function checkOptionalPermissions() {
  return validatePermissions(PERMISSIONS.OPTIONAL);
}
