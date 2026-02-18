import { useEffect, type ReactElement } from 'react';

import { MurderBoard } from './components/MurderBoard';
import { useGameStore } from './store/gameStore';
import './App.css';

import './styles/murder-board.css';

function App(): ReactElement {
  const startSimulation = useGameStore((state): (() => Promise<void>) => {
    return state.startSimulation;
  });
  const stopSimulation = useGameStore((state): (() => void) => {
    return state.stopSimulation;
  });

  useEffect((): (() => void) => {
    void startSimulation();

    return (): void => {
      stopSimulation();
    };
  }, [startSimulation, stopSimulation]);

  return <MurderBoard />;
}

export default App;
