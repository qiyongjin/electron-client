// CSS 模块声明
declare module '*.css' {
  const styles: Record<string, string>;
  export default styles;
}

// CSS 副作用导入
declare module '*.css' {
  const content: string;
  export default content;
}

// 图片资源
declare module '*.png' {
  const value: string;
  export default value;
}

declare module '*.jpg' {
  const value: string;
  export default value;
}

declare module '*.svg' {
  const value: string;
  export default value;
}