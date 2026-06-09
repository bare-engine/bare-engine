function stripQueryAndHash(path: string): string
{
    return path.split(/[?#]/, 1)[0];
}

function extname(path: string): string
{
    const cleanPath = stripQueryAndHash(path);
    const base = cleanPath.substring(cleanPath.lastIndexOf('/') + 1);
    const dot = base.lastIndexOf('.');

    return dot > 0 ? base.substring(dot) : '';
}

function basename(path: string, ext = ''): string
{
    const cleanPath = stripQueryAndHash(path);
    const base = cleanPath.substring(cleanPath.lastIndexOf('/') + 1);

    return ext && base.endsWith(ext) ? base.substring(0, base.length - ext.length) : base;
}

export { basename, extname };
