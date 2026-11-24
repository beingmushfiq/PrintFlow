<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('plans', function (Blueprint $table) {
            $table->char('id', 26)->primary();
            $table->string('name', 128);
            $table->string('code', 64)->unique();
            $table->string('currency', 3)->default('BDT');
            $table->unsignedBigInteger('amount_minor')->default(0); // integer minor units (Poisha)
            $table->string('billing_interval', 32)->default('month'); // month, year
            $table->integer('billing_interval_count')->default(1);
            $table->integer('trial_days')->default(0);
            $table->boolean('is_active')->default(true);
            $table->json('features_json')->nullable();
            $table->json('limits_json')->nullable();
            $table->timestamps();

            $table->index(['is_active', 'code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('plans');
    }
};
