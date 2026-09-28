import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TRIP_DATA } from './data';
import { TripEngine } from './engine/trip';
import { initTts } from './speech/tts';
import { StoreContext, TripStore } from './store/tripStore';
import { App } from './ui/App';
import './ui/styles.css';

const store = new TripStore(new TripEngine(TRIP_DATA));
initTts(() => store.refreshUi());
store.startLoop();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreContext.Provider value={store}>
      <App />
    </StoreContext.Provider>
  </StrictMode>,
);
