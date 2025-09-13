// TODO: Remove when https://github.com/sasaplus1/deepcopy.js/issues/278 is fixed
declare type Customizer = (value: any, valueType: string) => unknown;
declare type Options = Customizer | { customizer: Customizer };
declare function deepcopy<T>(value: T, options?: Options): T;
export default deepcopy;
