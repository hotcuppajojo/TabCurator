import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import configureStore from 'redux-mock-store';
import Popup from '../../../popup/Popup';

const mockStore = configureStore([]);

describe('Popup Component Tests', () => {
  let store;

  beforeEach(() => {
    store = mockStore({
      tabManagement: {
        tabs: [
          { id: 1, title: 'Test Tab', url: 'https://example.com' }
        ]
      }
    });
  });

  test('renders tab list correctly', () => {
    render(
      <Provider store={store}>
        <Popup />
      </Provider>
    );

    expect(screen.getByText('Test Tab')).toBeInTheDocument();
  });

  test('handles tab actions correctly', () => {
    render(
      <Provider store={store}>
        <Popup />
      </Provider>
    );

    const actionButton = screen.getByRole('button', { name: /close/i });
    fireEvent.click(actionButton);

    const actions = store.getActions();
    expect(actions).toContainEqual(
      expect.objectContaining({ type: 'tab/remove' })
    );
  });
});
