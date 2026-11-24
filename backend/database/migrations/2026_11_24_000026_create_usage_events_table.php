<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('usage_events', function (Blueprint $table) {
            $table->char('id', 26)->primary();
            $table->char('tenant_id', 26);
            $table->char('shop_id', 26)->nullable();
            $table->string('event_type', 64); // page_printed, sms_notification
            $table->integer('quantity')->default(1);
            $table->string('unit', 32)->default('pages');
            $table->string('source_id', 128)->nullable();
            $table->timestamp('occurred_at');
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->foreign('shop_id')->references('id')->on('shops')->onDelete('set null');

            $table->index(['tenant_id', 'event_type', 'occurred_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('usage_events');
    }
};
