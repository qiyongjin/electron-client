import { createHashRouter, Navigate } from "react-router-dom"
import HomeComponent from "../pages/HomeComponent"
import HomeTest from "../pages/HomeTest"
import BroadCast from "../pages/BroadCast"
import ChatPage from "../pages/ChatPage"


// 错误边界组件
function ErrorBoundary() {
    return (
        <div style={{ padding: '20px', textAlign: 'center' }}>
            <h1>页面加载失败</h1>
            <p>请检查应用是否完整或重新启动</p>
            <button onClick={() => window.location.reload()}>
                重新加载
            </button>
        </div>
    )
}

const routers = [
    {
        path: "/",
        element: <Navigate to="/chatPage" replace />,
        errorElement: <ErrorBoundary />
    },
    {
        path: "/chatPage",
        element: <ChatPage />,
        errorElement: <ErrorBoundary />
    },
    {
        path: "/chat",
        element: <Navigate to="/chatPage" replace />,
        errorElement: <ErrorBoundary />
    },
    {
        path: "/test",
        element: <HomeTest />,
        errorElement: <ErrorBoundary />
    },
    {
        path: "/home",
        element: <HomeComponent />,
        errorElement: <ErrorBoundary />
    },
    {
        path: "/broad",
        element: <BroadCast />,
        errorElement: <ErrorBoundary />
    }
]

// Hash routes also work when the packaged Electron app loads index.html through file://.
export const router = createHashRouter(routers)
