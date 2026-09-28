import { AlertBanner } from './AlertBanner';
import { DirectorPanel } from './DirectorPanel';
import { GuideCard } from './GuideCard';
import { MapView } from './MapView';
import { PhoneFrame } from './PhoneFrame';
import { ServiceSheet } from './ServiceSheet';
import { TopBar } from './TopBar';
import { TripSummary } from './TripSummary';
import { VoiceBar } from './VoiceBar';

export function App() {
  return (
    <div className="stage">
      <PhoneFrame>
        <TopBar />
        <MapView />
        <GuideCard />
        <VoiceBar />
        <ServiceSheet />
        <AlertBanner />
        <TripSummary />
      </PhoneFrame>
      <DirectorPanel />
    </div>
  );
}
