package com.yogesh.streamer.core.extractors

import java.util.regex.Pattern

object JsUnpacker {
    private val PACKED_PATTERN = Pattern.compile(
        """\}\s*\('(.*)',\s*(\d+),\s*(\d+),\s*'(.*)'\.split\('\|'\)""",
        Pattern.DOTALL
    )

    fun unpack(packedJs: String): String {
        val matcher = PACKED_PATTERN.matcher(packedJs)
        if (!matcher.find()) return packedJs

        val payload = matcher.group(1) ?: return packedJs
        val radixStr = matcher.group(2) ?: "10"
        val countStr = matcher.group(3) ?: "0"
        val symtabStr = matcher.group(4) ?: ""

        val radix = radixStr.toIntOrNull() ?: 10
        val count = countStr.toIntOrNull() ?: 0
        val dictionary = symtabStr.split("|")

        fun getWord(encoded: String): String {
            val index = try {
                encoded.toInt(radix)
            } catch (e: Exception) {
                -1
            }
            return if (index in 0 until count && index < dictionary.size && dictionary[index].isNotEmpty()) {
                dictionary[index]
            } else {
                encoded
            }
        }

        val wordPattern = Pattern.compile("""\b\w+\b""")
        val wordMatcher = wordPattern.matcher(payload)
        val sb = StringBuffer()

        while (wordMatcher.find()) {
            val word = wordMatcher.group()
            val replacement = getWord(word)
            wordMatcher.appendReplacement(sb, MatcherHelper.quoteReplacement(replacement))
        }
        wordMatcher.appendTail(sb)

        return sb.toString()
    }
}

object MatcherHelper {
    fun quoteReplacement(s: String): String {
        if (!s.contains('\\') && !s.contains('$')) return s
        val sb = StringBuilder()
        for (c in s) {
            if (c == '\\' || c == '$') sb.append('\\')
            sb.append(c)
        }
        return sb.toString()
    }
}
