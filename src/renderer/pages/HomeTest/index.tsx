import { useEffect } from 'react';
import { Link } from 'react-router-dom';
const HomeTest = () =>{

    const Test = async () => {
        console.log('测试')
        const data = await window.electronAPI?.file?.readFile("C:\\Users\\Administrator\\aipywork\\126\\ai_image_1787043884687.png")
        console.log('HomeComponent render', data,"88888888")
    }

    const handlePing = async (action: string) => {
        const result = await window.electronAPI?.sevenapp?.request({ action });
        console.log('Ping response', result)
    }

    useEffect(() => {
        return window.electronAPI?.sevenapp?.onMessage((response) => {
            console.log('Sevenapp message received', response)
        })
    }, [])
    
    

    return (
        <div className="w-full p-3">
            <Link to="/chatPage" className="block mb-4 text-green-700">← 返回小七对话</Link>
            <button onClick={()=>Test()}>测试</button>
            <button onClick={()=>window.electronAPI?.windowControls?.close()}>窗口关闭</button>
            <button onClick={()=>window.electronAPI?.dialog?.showMessageBox({ title: '测试', message: '这是一个测试弹窗' })}>打开弹窗</button>
            <button onClick={()=>window.electronAPI?.app?.getPath("userData")}>获取应用路径</button>

            <button onClick={()=> handlePing("Ping")}>Ping</button>
            <button onClick={()=> handlePing("message")}>message</button>
        </div>
    )
}

export default HomeTest
