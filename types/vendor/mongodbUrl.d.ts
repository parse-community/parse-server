declare function urlParse(url: any, parseQueryString: any, slashesDenoteHost: any): Url;
declare function urlResolve(source: any, relative: any): string;
declare function urlResolveObject(source: any, relative: any): any;
declare function urlFormat(obj: any): any;
export function Url(): void;
export class Url {
    protocol: any;
    slashes: boolean;
    auth: string;
    host: any;
    port: string[];
    hostname: any;
    hash: string;
    search: string;
    query: any;
    pathname: string;
    path: string;
    href: string;
    parse(url: any, parseQueryString: any, slashesDenoteHost: any): Url;
    format(): string;
    resolve(relative: any): string;
    resolveObject(relative: any): Url;
    parseHost(): void;
}
export { urlParse as parse, urlResolve as resolve, urlResolveObject as resolveObject, urlFormat as format };
