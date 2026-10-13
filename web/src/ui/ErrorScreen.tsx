import { useT } from '../i18n'
import styles from '../App.module.css'

export default function ErrorScreen({ message, onRetry }: { message: string; onRetry(): void }) {
  const t = useT()
  return (
    <div className={styles.error} data-testid="error-screen">
      <h1>{t('ui.loadError')}</h1>
      <p>{message}</p>
      <button data-testid="retry" onClick={onRetry}>
        {t('ui.retry')}
      </button>
    </div>
  )
}
