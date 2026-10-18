import { createApp, createSSRApp } from 'vue'
import './style.css'
import App from './App.vue'

const root = document.getElementById('app')!
const pathname = location.pathname.replace(/\/index\.html$/, '/').replace(/\/+$/, '')
const props = { page: pathname === '/signal-processing' ? 'signal-processing' as const : 'home' as const }
const app = root.hasChildNodes() ? createSSRApp(App, props) : createApp(App, props)
app.mount(root)
