import { createDemoState } from './demo-data';
import { AppStore } from './store';

describe('AppStore', () => {
  beforeEach(() => localStorage.clear());

  it('persists repository changes and restores them in a new store', () => {
    const store = new AppStore();
    store.clients.update('client-vector', { repeatPotential: 0.77 });

    const restored = new AppStore();
    expect(restored.clients.get('client-vector')?.repeatPotential).toBe(0.77);
    expect(localStorage.getItem('promisoflow.data')).toContain('"repeatPotential":0.77');
  });

  it('does not expose mutable repository objects', () => {
    const store = new AppStore();
    const client = store.clients.get('client-vector')!;
    client.name.en = 'Changed outside the store';
    expect(store.clients.get('client-vector')?.name.en).toBe('Vector');
  });

  it('resets all business data without resetting language, portal language, or role', () => {
    localStorage.setItem('promisoflow.language', 'en-US');
    localStorage.setItem('promisoflow.portal-language', 'ru-RU');
    localStorage.setItem('promisoflow.role', 'finance');

    const store = new AppStore();
    store.clients.update('client-vector', { repeatPotential: 0.1 });
    store.setCompletedActionIds(['action-vector-payment']);
    store.reset();

    expect(store.snapshot()).toEqual(createDemoState());
    expect(localStorage.getItem('promisoflow.language')).toBe('en-US');
    expect(localStorage.getItem('promisoflow.portal-language')).toBe('ru-RU');
    expect(localStorage.getItem('promisoflow.role')).toBe('finance');
  });

  it('falls back to deterministic data when storage is invalid', () => {
    localStorage.setItem('promisoflow.data', '{invalid json');
    expect(new AppStore().snapshot()).toEqual(createDemoState());
  });

  it('supports typed add, update, and remove repository operations', () => {
    const store = new AppStore();
    const client = { ...store.clients.get('client-atlas')!, id: 'client-copy' };
    store.clients.add(client);
    store.clients.update('client-copy', { repeatPotential: 0.5 });
    expect(store.clients.get('client-copy')?.repeatPotential).toBe(0.5);
    store.clients.remove('client-copy');
    expect(store.clients.get('client-copy')).toBeUndefined();
  });
});
