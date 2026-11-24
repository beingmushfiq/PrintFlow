<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shops', function (Blueprint $table) {
            $table->char('id', 26)->primary();
            $table->char('tenant_id', 26);
            $table->string('name');
            $table->string('slug')->unique();
            $table->text('address')->nullable();
            $table->string('phone', 32)->nullable();
            $table->string('email')->nullable();
            $table->string('logo_object_key')->nullable();
            $table->string('locale', 10)->default('bn');
            $table->string('currency', 3)->default('BDT');
            $table->string('timezone', 64)->default('Asia/Dhaka');
            $table->string('public_status', 32)->default('active'); // active, paused, closed
            $table->json('public_settings_json')->nullable();
            $table->char('default_price_profile_id', 26)->nullable();
            $table->timestamps();

            $table->foreign('tenant_id')->references('id')->on('tenants')->onDelete('cascade');
            $table->index(['tenant_id', 'slug']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shops');
    }
};
