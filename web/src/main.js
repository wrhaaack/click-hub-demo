import { createApp } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import './estilos.css';

// El tema (claro u oscuro) se aplica antes de montar nada, así ni la pantalla
// de carga ni el login aparecen un instante con el tema equivocado.
document.documentElement.dataset.tema = localStorage.getItem('ck-tema') || 'claro';

const router = createRouter({
  history: createWebHistory('/app/'),
  routes: [
    { path: '/login', component: () => import('./views/Login.vue'), meta: { publica: true } },
    { path: '/', component: () => import('./views/Dashboard.vue') },
    { path: '/clientes', component: () => import('./views/Clientes.vue') },
    { path: '/tareas', component: () => import('./views/Tareas.vue') },
    { path: '/calendario', component: () => import('./views/Calendario.vue') },
    { path: '/brainstorm', component: () => import('./views/Brainstorm.vue') },
    { path: '/disenos', component: () => import('./views/Liquidaciones.vue') },
    { path: '/pauta', component: () => import('./views/Pauta.vue') },
    { path: '/cotizador', component: () => import('./views/Cotizador.vue') },
    { path: '/equipo', component: () => import('./views/Equipo.vue') },
    { path: '/estudio', component: () => import('./views/Estudio.vue') },
    { path: '/usuarios', component: () => import('./views/Usuarios.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

// Se monta recién cuando el router sabe en qué pantalla está: App necesita
// saber si es el login (no carga nada) o una pantalla con sesión.
router.isReady().then(() => createApp(App).use(router).mount('#app'));
router.push(window.location.pathname.replace(/^\/app/, '') + window.location.search);
