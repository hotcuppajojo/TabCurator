// tests/jest/mocks/webextensionPolyfillMock.js
const bookmarks = {
  search: jest.fn(),
  create: jest.fn(),
  remove: jest.fn(),
};
export default { bookmarks };