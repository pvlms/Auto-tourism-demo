import { useRef, useState } from 'react';
import { listenOnce, sttSupported } from '../speech/stt';
import { useStore, useTrip } from '../store/tripStore';

export function VoiceBar() {
  const s = useTrip();
  const store = useStore();
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const stopListening = useRef<(() => void) | null>(null);

  const send = (value: string) => {
    const t = value.trim();
    if (!t) return;
    setHint(null);
    store.act((e) => e.handleText(t));
    setText('');
  };

  const toggleMic = () => {
    if (listening) {
      stopListening.current?.();
      return;
    }
    setHint(null);
    setListening(true);
    stopListening.current = listenOnce({
      onText: send,
      onError: setHint,
      onEnd: () => setListening(false),
    });
  };

  const reply = hint ?? s.lastReply;

  return (
    <div className="voice">
      {reply && <p className="voice-reply">{reply}</p>}
      <form
        className="voice-row"
        onSubmit={(ev) => {
          ev.preventDefault();
          send(text);
        }}
      >
        {sttSupported() && (
          <button type="button" className={`voice-mic ${listening ? 'is-on' : ''}`} onClick={toggleMic} aria-label="Голосовой ввод">
            🎤
          </button>
        )}
        <input
          className="voice-input"
          value={text}
          onChange={(ev) => setText(ev.target.value)}
          placeholder="«Расскажи про Тулу», «Найди кафе»"
        />
        <button className="voice-send" type="submit" aria-label="Отправить">➤</button>
      </form>
    </div>
  );
}
