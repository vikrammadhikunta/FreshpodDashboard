// config/axios.js

import axios from 'axios';

const axiosInstance = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
    withCredentials: true,
});

let refreshPromise = null;


// ===============================
// REQUEST INTERCEPTOR
// ===============================

axiosInstance.interceptors.request.use(
    (config) => {

        const token = localStorage.getItem('accessToken');

        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        return config;
    },

    (error) => Promise.reject(error)
);


// ===============================
// RESPONSE INTERCEPTOR
// ===============================

axiosInstance.interceptors.response.use(

    (response) => response,

    async (error) => {

        const originalRequest = error.config;

        // Not a 401
        if (error.response?.status !== 401) {
            return Promise.reject(error);
        }

        // Prevent infinite retry
        if (originalRequest._retry) {
            return Promise.reject(error);
        }

        // Don't refresh login or refresh endpoint
        if (
            originalRequest.url?.includes('/login') ||
            originalRequest.url?.includes('/refresh-token')
        ) {
            return Promise.reject(error);
        }

        originalRequest._retry = true;

        const refreshToken =
            localStorage.getItem('refreshToken');

        if (!refreshToken) {

            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');

            window.location.href = '/login';

            return Promise.reject(error);
        }

        try {

            // ===============================
            // ONLY ONE REFRESH REQUEST
            // ===============================

            if (!refreshPromise) {

                refreshPromise = axios
                    .post(
                        `${import.meta.env.VITE_API_URL}/user/refresh-token`,
                        {
                            refreshToken
                        },
                        {
                            withCredentials: true
                        }
                    )
                    .then((response) => {

                        const {
                            accessToken,
                            refreshToken: newRefreshToken
                        } = response.data;

                        if (!accessToken) {
                            throw new Error(
                                'No access token returned'
                            );
                        }

                        // Save new tokens
                        localStorage.setItem(
                            'accessToken',
                            accessToken
                        );

                        if (newRefreshToken) {
                            localStorage.setItem(
                                'refreshToken',
                                newRefreshToken
                            );
                        }

                        return accessToken;
                    })
                    .finally(() => {

                        refreshPromise = null;

                    });
            }

            // Wait for existing refresh
            const newAccessToken =
                await refreshPromise;


            // ===============================
            // RETRY ORIGINAL REQUEST
            // ===============================

            originalRequest.headers =
                originalRequest.headers || {};

            originalRequest.headers.Authorization =
                `Bearer ${newAccessToken}`;

            return axiosInstance(originalRequest);

        } catch (refreshError) {

            console.error(
                'Token refresh failed:',
                refreshError
            );

            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
            localStorage.removeItem('user');

            delete axiosInstance.defaults.headers.common.Authorization;

            window.location.href = '/login';

            return Promise.reject(refreshError);
        }
    }
);

export default axiosInstance;
