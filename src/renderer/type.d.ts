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