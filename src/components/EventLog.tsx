import { AnimatePresence, motion } from 'framer-motion';
import type { ReactElement } from 'react';

export type EventLogTone = 'info' | 'warning' | 'success';

export type EventLogEntry = {
  id: string;
  tone: EventLogTone;
  line: string;
  stampedAt: string;
};

type EventLogProps = {
  entries: readonly EventLogEntry[];
};

const eventTransition = {
  type: 'spring',
  stiffness: 280,
  damping: 28,
} as const;

export const EventLog = ({ entries }: EventLogProps): ReactElement => {
  return (
    <section className="event-log" aria-label="Event log">
      <header className="event-log__header">
        <h2>Street Wire</h2>
        <p>Recent whispers from the board.</p>
      </header>

      <motion.ul className="event-log__list" layout>
        <AnimatePresence initial={false}>
          {entries.map((entry, index) => {
            return (
              <motion.li
                key={entry.id}
                className={`event-log__entry event-log__entry--${entry.tone}`}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ ...eventTransition, delay: index * 0.045 }}
                layout
              >
                <span className="event-log__time">{entry.stampedAt}</span>
                <p>{entry.line}</p>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </motion.ul>
    </section>
  );
};
