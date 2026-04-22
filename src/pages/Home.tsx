import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './home.module.css';

type Frequency = 'monthly' | 'annual';

export default function Home() {
  const [inputValue, setInputValue] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = Number(inputValue);
    if (!raw || raw <= 0) return;
    const monthly = frequency === 'monthly' ? raw : raw / 12;
    navigate('/3d-experience', { state: { userInput: monthly } });
  };

  const placeholder = frequency === 'monthly' ? 'Enter your income' : 'Enter your income';
  const hint = frequency === 'monthly'
    ? 'UK median take-home is around £2,300/month'
    : 'UK median take-home is around £27,600/year';

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <div className={styles.logo} role="img" aria-label="Divide" />
        <h1 className={styles.title}>Divide</h1>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.toggle} role="tablist" aria-label="Income frequency">
            <button
              type="button"
              role="tab"
              aria-selected={frequency === 'monthly'}
              className={`${styles.toggleButton} ${frequency === 'monthly' ? styles.toggleActive : ''}`}
              onClick={() => setFrequency('monthly')}
            >
              Monthly
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={frequency === 'annual'}
              className={`${styles.toggleButton} ${frequency === 'annual' ? styles.toggleActive : ''}`}
              onClick={() => setFrequency('annual')}
            >
              Annual
            </button>
          </div>

          <div className={styles.inputWrap}>
            <span className={styles.prefix}>£</span>
            <input
              type="number"
              placeholder={placeholder}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className={styles.input}
              min="1"
              required
            />
          </div>

          <p className={styles.hint}>{hint}</p>
          <p className={styles.enterHint}>Press Enter ↵</p>
        </form>
      </main>
    </div>
  );
}
