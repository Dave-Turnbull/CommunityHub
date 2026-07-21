<?php

namespace Tests\Unit\Support;

use App\Support\ChannelFocus;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class ChannelFocusTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    public function test_a_user_is_not_focused_by_default(): void
    {
        $this->assertFalse(ChannelFocus::isFocused('user-1', 'chan-1'));
    }

    public function test_focus_marks_a_user_as_focused(): void
    {
        ChannelFocus::focus('user-1', 'chan-1');

        $this->assertTrue(ChannelFocus::isFocused('user-1', 'chan-1'));
    }

    public function test_focus_is_scoped_to_the_specific_channel(): void
    {
        ChannelFocus::focus('user-1', 'chan-1');

        $this->assertFalse(ChannelFocus::isFocused('user-1', 'chan-2'));
    }

    public function test_blur_clears_focus(): void
    {
        ChannelFocus::focus('user-1', 'chan-1');
        ChannelFocus::blur('user-1', 'chan-1');

        $this->assertFalse(ChannelFocus::isFocused('user-1', 'chan-1'));
    }

    public function test_refocusing_after_a_blur_marks_the_user_focused_again(): void
    {
        ChannelFocus::focus('user-1', 'chan-1');
        ChannelFocus::blur('user-1', 'chan-1');
        ChannelFocus::focus('user-1', 'chan-1');

        $this->assertTrue(ChannelFocus::isFocused('user-1', 'chan-1'));
    }
}
