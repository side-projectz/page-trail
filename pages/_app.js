import '@picocss/pico/css/pico.min.css';
import '../styles/globals.css';

export default function App({ Component, pageProps: { ...pageProps } }) {
  return <Component {...pageProps} />;
}
