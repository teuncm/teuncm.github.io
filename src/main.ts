import { createApp, createSSRApp } from 'vue'
import './style.css'
import App from './App.vue'

const root = document.getElementById('app')!
const props = { page: location.pathname.replace(/\/+$/, '') === '/signal-processing' ? 'signal-processing' as const : 'home' as const }
const app = root.hasChildNodes() ? createSSRApp(App, props) : createApp(App, props)
app.mount(root)
