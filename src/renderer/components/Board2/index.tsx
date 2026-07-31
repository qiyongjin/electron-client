import { DndContext, type DragEndEvent } from "@dnd-kit/core"
import { useKnaban } from "../../stores/useKanban"
import { Task  } from "./Task"
import { KanbanGroup } from "./KanbanGroup"

export const Board = () => {
    const {boards, updateBoard, moveTask, deleteBoard } =useKnaban()
    const handleGragEnd = ({active, over}:DragEndEvent) => {
        console.log("-----", active, over)
        const { id } = active;
        const [gId,tId] = `${id}`.split("-")
        if(over && gId !==over?.id)
            moveTask(tId, gId, `${over?.id}`)
    }
    const handleDelete = (id:number| string) =>{
        deleteBoard(id)
    }
    
    return (
        <DndContext onDragEnd={handleGragEnd}>
            <div className="flex flex-row flex-wrap gap-3">
                {
                    boards.map(board => (
                        <div className="flex flex-row" key={board.id}>
                            <KanbanGroup title={board.groupName} groupId={board.id}>
                                <div className="kanban-group w-[260px] bg-red-50 rounded-2xl p-2">
                                    <div className="flex">
                                        <div className="rounded-full w-full">
                                            <div className=" flex justify-between ">
                                            <div className="rounded-full bg-blue-300 p-1 pl-4 pr-4 w-[100px]text-amber-50 ">未开始</div>
                                            <div className="p-1 rounded-4xl bg-blue-300 pl-2 pr-2 cursor-pointer" onClick={()=>handleDelete(board.id)}>×</div>
                                            </div>
                                            <div className="mt-2">
                                                {
                                                    board.task.map((item)=> (<Task key={item} id={`${board.id}-${item}`} title={`${item}`}></Task>))
                                                }
                                            </div>
                                            <button className="p-2 bg-blue-300 mt-1 rounded-2xl w-full"
                                            onClick={()=> updateBoard(board.id, {
                                                ...board,
                                                task:[...board.task, `${Math.floor(Math.random() * 1000)}`],
                                            })}>添加任务</button>
                                        </div>

                                    </div>
                                </div>
                            </KanbanGroup>
                    </div>
                    ))
                }
            </div>
        </DndContext>
    )
}