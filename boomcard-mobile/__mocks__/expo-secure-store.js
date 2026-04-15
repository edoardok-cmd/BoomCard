const store = {};

module.exports = {
  getItemAsync: jest.fn(async (key) => store[key] || null),
  setItemAsync: jest.fn(async (key, value) => {
    store[key] = value;
  }),
  deleteItemAsync: jest.fn(async (key) => {
    delete store[key];
  }),
  /** Reset in-memory store between tests */
  __reset() {
    Object.keys(store).forEach((k) => delete store[k]);
    this.getItemAsync.mockClear();
    this.setItemAsync.mockClear();
    this.deleteItemAsync.mockClear();
  },
};
