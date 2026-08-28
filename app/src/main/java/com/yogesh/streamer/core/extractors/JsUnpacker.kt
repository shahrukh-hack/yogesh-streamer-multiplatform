package com.yogesh.streamer.core.extractors

object JsUnpacker {

    fun unpack(packedJs: String): String? {
        val regex = Regex("""eval\(function\(p,a,c,k,e,[rd]\)\{.*\}\('(.*)',\s*(\d+),\s*(\d+),\s*'(.*?)'\.split\('\|'\)""", RegexOption.DOT_MATCHES_ALL)
        val match = regex.find(packedJs) ?: return null

        val payload = match.groupValues[1]
        val radix = match.groupValues[2].toIntOrNull() ?: 10
        val count = match.groupValues[3].toIntOrNull() ?: 0
        val symtab = match.groupValues[4].split("|")

        fun baseN(num: Int, base: Int): String {
            val chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
            if (num == 0) return "0"
            var n = num
            val sb = StringBuilder()
            while (n > 0) {
                sb.append(chars[n % base])
                n /= base
            }
            return sb.reverse().toString()
        }

        var result = payload
        for (i in count - 1 downTo 0) {
            val word = symtab.getOrNull(i)?.takeIf { it.isNotEmpty() } ?: baseN(i, radix)
            val key = baseN(i, radix)
            result = result.replace(Regex("""\b$key\b"""), word)
        }

        return result
    }
}
