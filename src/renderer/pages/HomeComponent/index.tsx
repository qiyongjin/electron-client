import { useKnaban } from "../../stores/useKanban"
import  {Board} from "../../components/Board"

const HomeComponent = () =>{
    const { createBoard } = useKnaban()

    return (
        <div className="w-full p-3">
           {/* {
            boards.map(board => (
                <div key={board.id}>{board.name}---{board.id}</div>
            ))
           } */}
           <Board></Board>
           <button className="border-tneutral-400 p-3 mt-2 rounded-2xl bg-blue-500 text-stone-50 pointer-coarse: w-[100px] flex align-middle justify-center h-12"
           onClick={()=> createBoard({
            id: `${Math.floor(Math.random()*10000)}`,
            groupName: '新版',
            task: []
            })}>创建分组</button>
        </div>
    )
}

export default HomeComponent