package com.yogesh.streamer

import com.yogesh.streamer.core.extractors.JsUnpacker
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class JsUnpackerTest {

    @Test
    fun testJsUnpackerBasic() {
        val packed = "eval(function(p,a,c,k,e,r){e=String;if(!''.replace(/^/,String)){while(c--)r[c]=k[c]||c;k=[function(e){return r[e]}];e=function(){return'\\\\w+'};c=1};while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+e(c)+'\\\\b','g'),k[c]);return p}('0 1=\"2://3/4.5\";',6,6,'var|stream_url|https|example.com|master|m3u8'.split('|'),0,{}))"

        val unpacked = JsUnpacker.unpack(packed)

        assertNotNull(unpacked)
        assertTrue(unpacked!!.contains("https://example.com/master.m3u8"))
    }
}
