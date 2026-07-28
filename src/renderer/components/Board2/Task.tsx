import { useDraggable } from "@dnd-kit/core";

export const Task = (props:{
    title:string,
    id: string | number 
}) => {
    const {title, id} = props;
    const { attributes, listeners,setNodeRef, transform } = useDraggable({
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
            <div className="p-2 bg-blue-200 mt-1 rounded-2xl w-full">任务--{title}</div>
        </div>
    )

}