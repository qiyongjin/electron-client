import { createBrowserRouter } from "react-router-dom"
import HomeComponent from "../pages/HomeComponent"
import HomeTest from "../pages/HomeTest"
import BroadCast from "../pages/BroadCast"


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

export const router = createBrowserRouter(routers)