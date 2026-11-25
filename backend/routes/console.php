<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote')->hourly();

\Illuminate\Support\Facades\Artisan::command('printflow:process-outbox', function () {
    $count = app(\App\Domain\Payment\Outbox\OutboxProcessor::class)->processPending(50);
    $this->info("Processed {$count} pending outbox event(s).");
})->purpose('Flush pending outbox events into queued print jobs');

\Illuminate\Support\Facades\Schedule::command('printflow:reconcile-leases')
    ->everyFiveMinutes()
    ->withoutOverlapping();

\Illuminate\Support\Facades\Schedule::command('printflow:process-outbox')
    ->everyMinute()
    ->withoutOverlapping();

