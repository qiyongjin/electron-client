import { useSortable } from "@dnd-kit/sortable";

export const Task = (props:{
    title:string,
    id: string | number 
}) => {
    const {title, id} = props;
    const { attributes, listeners,setNodeRef, transform, isDragging } = useSortable({
        id,
        data:{
            type: "task",
        }
    })
    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`
    } : undefined

    return (
        <div ref={setNodeRef}
        {...attributes}
        {...listeners}
        style={style}
        >
            <div className={`p-2 bg-blue-200 mt-1 rounded-2xl w-full ${isDragging ? "bg-blue-400" : ''}`}>任务--{title}</div>
        </div>
    )

}