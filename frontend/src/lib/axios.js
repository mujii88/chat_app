import axios from 'axios'

export const axiosInstance=axios.create({
    baseURL:import.meta.env.MODE==='development'?'http://localhost:5001/api':'/api',
    // Do not send cookies by default; rely on per-tab Authorization header
    withCredentials:false,
})

// Attach per-tab token from sessionStorage to support multiple logins in same browser
axiosInstance.interceptors.request.use((config)=>{
    const token = typeof window !== 'undefined' ? sessionStorage.getItem('token') : null;
    if (token) {
        config.headers = config.headers || {};
        config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
});