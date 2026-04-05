import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
// 1. Import the CSS module
import styles from './home.module.css';

export default function Home() {
  const [inputValue, setInputValue] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate('/3d-experience', { state: { userInput: inputValue } });
  };

  return (
    // 2. Apply the styles using the imported object
    <div className={styles.container}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <input 
          type="text" 
          placeholder="Enter your income..." 
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className={styles.input}
          required
        />
        <button type="submit" className={styles.button}>
          Generate Experience
        </button>
      </form>
    </div>
  );
}